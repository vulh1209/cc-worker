import { existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Context for preflight checks
 */
export interface PreflightContext {
  /** Path to the repository/working directory */
  repoPath: string;
  /** Optional branch to check */
  branch?: string;
  /** Type of task being executed */
  taskType?: string;
  /** Whether to skip certain checks */
  skipChecks?: {
    gitClean?: boolean;
    diskSpace?: boolean;
    claudeInstalled?: boolean;
  };
}

/**
 * Individual check results
 */
export interface PreflightChecks {
  /** Whether the repo path exists */
  repoExists: boolean;
  /** Whether the path is a git repository */
  isGitRepo: boolean;
  /** Whether git working tree is clean (no uncommitted changes) */
  gitClean: boolean;
  /** Whether the specified branch exists (if branch provided) */
  branchExists?: boolean;
  /** Whether there's enough disk space (min 1GB) */
  diskSpace: boolean;
  /** Whether Claude CLI is installed and accessible */
  claudeInstalled: boolean;
}

/**
 * Result of preflight checks
 */
export interface PreflightResult {
  /** Whether all required checks passed */
  passed: boolean;
  /** Individual check results */
  checks: PreflightChecks;
  /** Error messages for failed checks */
  errors: string[];
  /** Warning messages (non-blocking issues) */
  warnings: string[];
  /** Duration of preflight checks in ms */
  duration: number;
}

/**
 * PreflightChecker validates the environment before task execution.
 *
 * Inspired by NightShift's preflight system, this ensures:
 * - Repository exists and is valid
 * - Git environment is properly configured
 * - Sufficient disk space available
 * - Claude CLI is accessible
 */
export class PreflightChecker {
  private minDiskSpaceGB: number;

  constructor(options?: { minDiskSpaceGB?: number }) {
    this.minDiskSpaceGB = options?.minDiskSpaceGB ?? 1;
  }

  /**
   * Run all preflight checks
   */
  async runChecks(context: PreflightContext): Promise<PreflightResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.info(`[Preflight] Starting checks for: ${context.repoPath}`);

    // Run checks in parallel for efficiency
    const [
      repoExists,
      isGitRepo,
      gitCleanResult,
      branchExistsResult,
      diskSpaceResult,
      claudeInstalledResult,
    ] = await Promise.all([
      this.checkRepoExists(context.repoPath),
      this.checkIsGitRepo(context.repoPath),
      context.skipChecks?.gitClean ? Promise.resolve({ clean: true, error: undefined }) : this.checkGitClean(context.repoPath),
      context.branch ? this.checkBranchExists(context.repoPath, context.branch) : Promise.resolve(undefined),
      context.skipChecks?.diskSpace ? Promise.resolve({ ok: true, availableGB: 0 }) : this.checkDiskSpace(context.repoPath),
      context.skipChecks?.claudeInstalled ? Promise.resolve({ installed: true }) : this.checkClaudeInstalled(),
    ]);

    const checks: PreflightChecks = {
      repoExists,
      isGitRepo,
      gitClean: gitCleanResult.clean,
      branchExists: branchExistsResult,
      diskSpace: diskSpaceResult.ok,
      claudeInstalled: claudeInstalledResult.installed,
    };

    // Collect errors
    if (!repoExists) {
      errors.push(`Repository path does not exist: ${context.repoPath}`);
    }

    if (repoExists && !isGitRepo) {
      errors.push(`Path is not a git repository: ${context.repoPath}`);
    }

    if (!gitCleanResult.clean && gitCleanResult.error) {
      warnings.push(`Git working tree has uncommitted changes: ${gitCleanResult.error}`);
    }

    if (context.branch && branchExistsResult === false) {
      errors.push(`Branch does not exist: ${context.branch}`);
    }

    if (!diskSpaceResult.ok) {
      errors.push(`Insufficient disk space. Available: ${diskSpaceResult.availableGB.toFixed(2)}GB, Required: ${this.minDiskSpaceGB}GB`);
    }

    if (!claudeInstalledResult.installed) {
      errors.push('Claude CLI is not installed or not accessible. Please run `claude --version` to verify installation.');
    }

    const duration = Date.now() - startTime;
    const passed = errors.length === 0;

    logger.info(`[Preflight] Completed in ${duration}ms. Passed: ${passed}`);
    if (errors.length > 0) {
      logger.error(`[Preflight] Errors: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      logger.warn(`[Preflight] Warnings: ${warnings.join(', ')}`);
    }

    return {
      passed,
      checks,
      errors,
      warnings,
      duration,
    };
  }

  /**
   * Check if repository path exists
   */
  private async checkRepoExists(path: string): Promise<boolean> {
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a git repository
   */
  private async checkIsGitRepo(path: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: path });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if git working tree is clean
   */
  private async checkGitClean(path: string): Promise<{ clean: boolean; error?: string }> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: path });
      const clean = stdout.trim() === '';
      return {
        clean,
        error: clean ? undefined : `${stdout.split('\n').length} uncommitted changes`,
      };
    } catch (error) {
      return {
        clean: false,
        error: error instanceof Error ? error.message : 'Failed to check git status',
      };
    }
  }

  /**
   * Check if a specific branch exists
   */
  private async checkBranchExists(path: string, branch: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify ${branch}`, { cwd: path });
      return true;
    } catch {
      // Try remote branch
      try {
        await execAsync(`git rev-parse --verify origin/${branch}`, { cwd: path });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(path: string): Promise<{ ok: boolean; availableGB: number }> {
    try {
      // Use df command (works on macOS and Linux)
      const { stdout } = await execAsync(`df -k "${path}" | tail -1 | awk '{print $4}'`);
      const availableKB = parseInt(stdout.trim(), 10);
      const availableGB = availableKB / (1024 * 1024);

      return {
        ok: availableGB >= this.minDiskSpaceGB,
        availableGB,
      };
    } catch {
      // On Windows or if df fails, assume ok (can add Windows-specific check later)
      return { ok: true, availableGB: 0 };
    }
  }

  /**
   * Check if Claude CLI is installed
   */
  private async checkClaudeInstalled(): Promise<{ installed: boolean; version?: string }> {
    try {
      const { stdout } = await execAsync('claude --version');
      return {
        installed: true,
        version: stdout.trim(),
      };
    } catch {
      return { installed: false };
    }
  }
}

/**
 * Create a preflight checker with default options
 */
export function createPreflightChecker(options?: { minDiskSpaceGB?: number }): PreflightChecker {
  return new PreflightChecker(options);
}
