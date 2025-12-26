import { createWriteStream, existsSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { get } from 'https';
import { get as httpGet } from 'http';
import { platform, arch } from 'os';
import { execSync } from 'child_process';
import { logger } from './logger.js';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
  mandatory?: boolean;
}

export interface AutoUpdaterConfig {
  checkUrl: string; // URL to check for updates
  currentVersion: string;
  checkInterval: number; // ms
}

export class AutoUpdater {
  private config: AutoUpdaterConfig;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(config: AutoUpdaterConfig) {
    this.config = config;
  }

  start(): void {
    // Check immediately on start
    this.checkForUpdates();

    // Then check periodically
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);

    logger.info('Auto-updater started');
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      logger.debug('Checking for updates...');

      const updateInfo = await this.fetchUpdateInfo();

      if (!updateInfo) {
        return null;
      }

      if (this.isNewerVersion(updateInfo.version)) {
        logger.info(`Update available: ${updateInfo.version}`);
        return updateInfo;
      }

      logger.debug('Already on latest version');
      return null;
    } catch (error) {
      logger.error('Update check failed:', error);
      return null;
    }
  }

  private async fetchUpdateInfo(): Promise<UpdateInfo | null> {
    return new Promise((resolve) => {
      const url = new URL(this.config.checkUrl);
      const getter = url.protocol === 'https:' ? get : httpGet;

      const req = getter(url, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            resolve(info);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private isNewerVersion(newVersion: string): boolean {
    const current = this.parseVersion(this.config.currentVersion);
    const next = this.parseVersion(newVersion);

    for (let i = 0; i < 3; i++) {
      if (next[i] > current[i]) return true;
      if (next[i] < current[i]) return false;
    }

    return false;
  }

  private parseVersion(version: string): number[] {
    const cleaned = version.replace(/^v/, '');
    const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  async downloadAndInstall(updateInfo: UpdateInfo): Promise<boolean> {
    try {
      logger.info(`Downloading update: ${updateInfo.version}`);

      // Determine download URL based on platform
      const binaryName = this.getBinaryName();
      const downloadUrl = updateInfo.downloadUrl.replace('{platform}', binaryName);

      // Download to temp file
      const tempPath = `${process.execPath}.new`;
      await this.downloadFile(downloadUrl, tempPath);

      // Backup current binary
      const backupPath = `${process.execPath}.backup`;
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
      renameSync(process.execPath, backupPath);

      // Replace with new binary
      renameSync(tempPath, process.execPath);

      // Make executable
      if (platform() !== 'win32') {
        chmodSync(process.execPath, 0o755);
      }

      logger.info('Update installed successfully');
      logger.info('Restarting...');

      // Restart the process
      setTimeout(() => {
        process.exit(0); // Exit and let process manager restart
      }, 1000);

      return true;
    } catch (error) {
      logger.error('Update installation failed:', error);
      return false;
    }
  }

  private getBinaryName(): string {
    const p = platform();
    const a = arch();

    if (p === 'darwin') {
      return a === 'arm64' ? 'cc-worker-macos-arm64' : 'cc-worker-macos-x64';
    }
    if (p === 'win32') {
      return 'cc-worker-win.exe';
    }
    return 'cc-worker-linux';
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destPath);
      const urlObj = new URL(url);
      const getter = urlObj.protocol === 'https:' ? get : httpGet;

      getter(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        unlinkSync(destPath);
        reject(err);
      });
    });
  }
}

// Create singleton
let autoUpdater: AutoUpdater | null = null;

export function initAutoUpdater(config: AutoUpdaterConfig): AutoUpdater {
  if (!autoUpdater) {
    autoUpdater = new AutoUpdater(config);
    autoUpdater.start();
  }
  return autoUpdater;
}

export function getAutoUpdater(): AutoUpdater | null {
  return autoUpdater;
}
