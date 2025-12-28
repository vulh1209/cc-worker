import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Task ID associated with this worktree */
  taskId: string;
  /** Full path to the worktree directory */
  path: string;
  /** Branch name used in the worktree */
  branch: string;
  /** When the worktree was created */
  createdAt: Date;
  /** HEAD commit hash */
  commit?: string;
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  /** Base branch to create worktree from (default: main) */
  baseBranch?: string;
  /** Custom branch name (default: nightshift/task_{taskId}) */
  branchName?: string;
  /** Whether to fetch latest before creating (default: true) */
  fetchFirst?: boolean;
}

/**
 * WorktreeManager handles git worktree operations for parallel task execution.
 *
 * Git worktrees allow multiple working directories from the same repository,
 * enabling parallel task execution without conflicts. Each task gets its own
 * isolated worktree with a dedicated branch.
 *
 * Directory structure:
 * ~/.cc-worker/worktrees/
 * ├── task_abc123/          # Worktree for task abc123
 * │   └── (full repo checkout)
 * ├── task_def456/          # Worktree for task def456
 * │   └── (full repo checkout)
 * └── ...
 */
export class WorktreeManager {
  private baseRepoPath: string;
  private worktreeBaseDir: string;

  constructor(baseRepoPath: string, options?: { worktreeBaseDir?: string }) {
    this.baseRepoPath = baseRepoPath;
    this.worktreeBaseDir = options?.worktreeBaseDir || join(homedir(), '.cc-worker', 'worktrees');

    // Ensure worktree base directory exists
    if (!existsSync(this.worktreeBaseDir)) {
      mkdirSync(this.worktreeBaseDir, { recursive: true });
      logger.info(`[WorktreeManager] Created worktree directory: ${this.worktreeBaseDir}`);
    }
  }

  /**
   * Create a new worktree for a task
   *
   * @param taskId - Unique task identifier
   * @param options - Creation options
   * @returns Path to the created worktree
   */
  async createWorktree(taskId: string, options?: CreateWorktreeOptions): Promise<string> {
    const worktreePath = this.getWorktreePath(taskId);
    const branchName = options?.branchName || `nightshift/task_${taskId}`;
    const baseBranch = options?.baseBranch || 'main';

    logger.info(`[WorktreeManager] Creating worktree for task ${taskId}`);
    logger.info(`[WorktreeManager]   Path: ${worktreePath}`);
    logger.info(`[WorktreeManager]   Branch: ${branchName}`);
    logger.info(`[WorktreeManager]   Base: ${baseBranch}`);

    try {
      // Fetch latest if requested (default: true)
      if (options?.fetchFirst !== false) {
        try {
          await execAsync('git fetch origin', { cwd: this.baseRepoPath });
          logger.info('[WorktreeManager] Fetched latest from origin');
        } catch (fetchError) {
          logger.warn('[WorktreeManager] Failed to fetch, continuing with local state');
        }
      }

      // Check if worktree already exists
      if (existsSync(worktreePath)) {
        logger.warn(`[WorktreeManager] Worktree already exists, removing: ${worktreePath}`);
        await this.removeWorktree(taskId);
      }

      // Check if branch already exists
      const branchExists = await this.branchExists(branchName);
      if (branchExists) {
        // Use existing branch
        logger.info(`[WorktreeManager] Using existing branch: ${branchName}`);
        await execAsync(
          `git worktree add "${worktreePath}" "${branchName}"`,
          { cwd: this.baseRepoPath }
        );
      } else {
        // Create new branch from base
        logger.info(`[WorktreeManager] Creating new branch from ${baseBranch}`);
        await execAsync(
          `git worktree add -b "${branchName}" "${worktreePath}" "origin/${baseBranch}"`,
          { cwd: this.baseRepoPath }
        );
      }

      logger.info(`[WorktreeManager] Worktree created successfully: ${worktreePath}`);
      return worktreePath;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorktreeManager] Failed to create worktree: ${errorMsg}`);
      throw new Error(`Failed to create worktree for task ${taskId}: ${errorMsg}`);
    }
  }

  /**
   * Remove a worktree and optionally its branch
   *
   * @param taskId - Task identifier
   * @param options - Removal options
   */
  async removeWorktree(taskId: string, options?: { deleteBranch?: boolean }): Promise<void> {
    const worktreePath = this.getWorktreePath(taskId);
    const branchName = `nightshift/task_${taskId}`;

    logger.info(`[WorktreeManager] Removing worktree for task ${taskId}`);

    try {
      // First try git worktree remove
      try {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: this.baseRepoPath,
        });
      } catch {
        // If git worktree remove fails, manually remove the directory
        if (existsSync(worktreePath)) {
          rmSync(worktreePath, { recursive: true, force: true });
        }
        // Prune worktree references
        await execAsync('git worktree prune', { cwd: this.baseRepoPath });
      }

      // Delete the branch if requested
      if (options?.deleteBranch) {
        try {
          await execAsync(`git branch -D "${branchName}"`, { cwd: this.baseRepoPath });
          logger.info(`[WorktreeManager] Deleted branch: ${branchName}`);
        } catch {
          logger.warn(`[WorktreeManager] Could not delete branch: ${branchName}`);
        }
      }

      logger.info(`[WorktreeManager] Worktree removed successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorktreeManager] Failed to remove worktree: ${errorMsg}`);
      throw new Error(`Failed to remove worktree for task ${taskId}: ${errorMsg}`);
    }
  }

  /**
   * List all active worktrees
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const worktrees: WorktreeInfo[] = [];

    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: this.baseRepoPath,
      });

      // Parse git worktree list output
      const entries = stdout.split('\n\n').filter(Boolean);
      for (const entry of entries) {
        const lines = entry.split('\n');
        const pathLine = lines.find(l => l.startsWith('worktree '));
        const branchLine = lines.find(l => l.startsWith('branch '));
        const headLine = lines.find(l => l.startsWith('HEAD '));

        if (pathLine) {
          const path = pathLine.replace('worktree ', '');
          // Only include worktrees in our managed directory
          if (path.startsWith(this.worktreeBaseDir)) {
            const taskId = this.extractTaskId(path);
            if (taskId) {
              worktrees.push({
                taskId,
                path,
                branch: branchLine?.replace('branch refs/heads/', '') || 'unknown',
                commit: headLine?.replace('HEAD ', ''),
                createdAt: this.getCreatedAt(path),
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`[WorktreeManager] Failed to list worktrees: ${error}`);
    }

    return worktrees;
  }

  /**
   * Get worktree info for a specific task
   */
  async getWorktree(taskId: string): Promise<WorktreeInfo | null> {
    const worktrees = await this.listWorktrees();
    return worktrees.find(w => w.taskId === taskId) || null;
  }

  /**
   * Check if a worktree exists for a task
   */
  async worktreeExists(taskId: string): Promise<boolean> {
    const worktreePath = this.getWorktreePath(taskId);
    return existsSync(worktreePath);
  }

  /**
   * Cleanup stale worktrees (older than maxAgeHours)
   */
  async cleanupStale(maxAgeHours: number = 24): Promise<string[]> {
    const cleaned: string[] = [];
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();

    logger.info(`[WorktreeManager] Cleaning up stale worktrees (older than ${maxAgeHours}h)`);

    const worktrees = await this.listWorktrees();
    for (const wt of worktrees) {
      const age = now - wt.createdAt.getTime();
      if (age > maxAgeMs) {
        try {
          await this.removeWorktree(wt.taskId, { deleteBranch: true });
          cleaned.push(wt.taskId);
          logger.info(`[WorktreeManager] Cleaned up stale worktree: ${wt.taskId}`);
        } catch (error) {
          logger.warn(`[WorktreeManager] Failed to cleanup worktree ${wt.taskId}: ${error}`);
        }
      }
    }

    logger.info(`[WorktreeManager] Cleanup complete. Removed ${cleaned.length} stale worktrees`);
    return cleaned;
  }

  /**
   * Cleanup all worktrees (used during shutdown)
   */
  async cleanupAll(): Promise<void> {
    logger.info('[WorktreeManager] Cleaning up all worktrees');

    const worktrees = await this.listWorktrees();
    for (const wt of worktrees) {
      try {
        await this.removeWorktree(wt.taskId, { deleteBranch: false });
      } catch (error) {
        logger.warn(`[WorktreeManager] Failed to cleanup worktree ${wt.taskId}: ${error}`);
      }
    }

    // Final prune
    try {
      await execAsync('git worktree prune', { cwd: this.baseRepoPath });
    } catch {
      // Ignore prune errors
    }

    logger.info('[WorktreeManager] All worktrees cleaned up');
  }

  /**
   * Push changes from worktree to remote
   */
  async pushChanges(taskId: string): Promise<{ pushed: boolean; error?: string }> {
    const worktreePath = this.getWorktreePath(taskId);
    const branchName = `nightshift/task_${taskId}`;

    try {
      // Check if there are changes to push
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: worktreePath });
      if (status.trim()) {
        return { pushed: false, error: 'Uncommitted changes exist' };
      }

      // Push to remote
      await execAsync(`git push -u origin "${branchName}"`, { cwd: worktreePath });
      logger.info(`[WorktreeManager] Pushed changes for task ${taskId}`);
      return { pushed: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorktreeManager] Failed to push changes: ${errorMsg}`);
      return { pushed: false, error: errorMsg };
    }
  }

  // Helper methods

  private getWorktreePath(taskId: string): string {
    return join(this.worktreeBaseDir, `task_${taskId}`);
  }

  private extractTaskId(path: string): string | null {
    const match = path.match(/task_([a-zA-Z0-9]+)$/);
    return match ? match[1] : null;
  }

  private async branchExists(branchName: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: this.baseRepoPath });
      return true;
    } catch {
      return false;
    }
  }

  private getCreatedAt(path: string): Date {
    try {
      const stats = statSync(path);
      return stats.birthtime;
    } catch {
      return new Date();
    }
  }

  // Getters

  get baseRepo(): string {
    return this.baseRepoPath;
  }

  get worktreeDir(): string {
    return this.worktreeBaseDir;
  }
}

/**
 * Create a WorktreeManager instance
 */
export function createWorktreeManager(
  baseRepoPath: string,
  options?: { worktreeBaseDir?: string }
): WorktreeManager {
  return new WorktreeManager(baseRepoPath, options);
}
