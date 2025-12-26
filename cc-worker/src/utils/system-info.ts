import { hostname, platform, arch, release, cpus, totalmem } from 'os';

export interface SystemInfo {
  hostname: string;
  os: string;
  platform: string;
  arch: string;
  release: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryGB: number;
}

export function getSystemInfo(): SystemInfo {
  const cpuList = cpus();

  // Format OS name nicely
  const platformName = platform();
  const osName = platformName === 'darwin'
    ? 'macOS'
    : platformName === 'win32'
      ? 'Windows'
      : platformName.charAt(0).toUpperCase() + platformName.slice(1);

  return {
    hostname: hostname(),
    os: `${osName} ${release()}`,
    platform: platformName,
    arch: arch(),
    release: release(),
    cpuCount: cpuList.length,
    cpuModel: cpuList[0]?.model || 'Unknown',
    totalMemoryGB: Math.round(totalmem() / (1024 * 1024 * 1024) * 10) / 10,
  };
}

export function formatSystemInfo(info: SystemInfo): string {
  return [
    `Host: ${info.hostname}`,
    `OS: ${info.os} (${info.arch})`,
    `CPU: ${info.cpuCount}x ${info.cpuModel}`,
    `RAM: ${info.totalMemoryGB} GB`,
  ].join('\n');
}
