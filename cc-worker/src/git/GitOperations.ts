import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Git status information
 */
export interface GitStatus {
  /** Whether working tree is clean */
  clean: boolean;
  /** Current branch name */
  branch: string;
  /** Number of staged files */
  staged: number;
  /** Number of modified files */
  modified: number;
  /** Number of untracked files */
  untracked: number;
  /** Ahead of remote by N commits */
  ahead: number;
  /** Behind remote by N commits */
  behind: number;
}

/**
 * Commit information
 */
export interface CommitInfo {
  /** Commit hash */
  hash: string;
  /** Short hash (7 chars) */
  shortHash: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Commit date */
  date: Date;
}

/**
 * Git operations utility class
 */
export class GitOperations {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /**
   * Get current git status
   */
  async getStatus(): Promise<GitStatus> {
    const branch = await this.getCurrentBranch();
    const { stdout: porcelain } = await execAsync('git status --porcelain', { cwd: this.cwd });

    const lines = porcelain.split('\n').filter(Boolean);
    let staged = 0;
    let modified = 0;
    let untracked = 0;

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];

      if (indexStatus !== ' ' && indexStatus !== '?') staged++;
      if (workTreeStatus === 'M' || workTreeStatus === 'D') modified++;
      if (indexStatus === '?') untracked++;
    }

    // Get ahead/behind info
    const { ahead, behind } = await this.getAheadBehind();

    return {
      clean: lines.length === 0,
      branch,
      staged,
      modified,
      untracked,
      ahead,
      behind,
    };
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Get ahead/behind counts relative to upstream
   */
  async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      const { stdout } = await execAsync('git rev-list --left-right --count HEAD...@{upstream}', {
        cwd: this.cwd,
      });
      const [ahead, behind] = stdout.trim().split('\t').map(Number);
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * Get the latest commit info
   */
  async getLatestCommit(): Promise<CommitInfo | null> {
    try {
      const { stdout } = await execAsync(
        'git log -1 --format="%H|%h|%s|%an|%aI"',
        { cwd: this.cwd }
      );
      const [hash, shortHash, message, author, dateStr] = stdout.trim().split('|');
      return {
        hash,
        shortHash,
        message,
        author,
        date: new Date(dateStr),
      };
    } catch {
      return null;
    }
  }

  /**
   * Stage all changes
   */
  async stageAll(): Promise<void> {
    await execAsync('git add -A', { cwd: this.cwd });
  }

  /**
   * Create a commit with the given message
   */
  async commit(message: string): Promise<CommitInfo> {
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.cwd });
    const commit = await this.getLatestCommit();
    if (!commit) {
      throw new Error('Failed to get commit info after committing');
    }
    return commit;
  }

  /**
   * Stage all and commit
   */
  async stageAndCommit(message: string): Promise<CommitInfo | null> {
    const status = await this.getStatus();
    if (status.clean) {
      logger.info('[GitOperations] No changes to commit');
      return null;
    }

    await this.stageAll();
    return this.commit(message);
  }

  /**
   * Push current branch to remote
   */
  async push(options?: { setUpstream?: boolean; force?: boolean }): Promise<void> {
    const branch = await this.getCurrentBranch();
    let cmd = 'git push';

    if (options?.setUpstream) {
      cmd += ` -u origin ${branch}`;
    }
    if (options?.force) {
      cmd += ' --force';
    }

    await execAsync(cmd, { cwd: this.cwd });
  }

  /**
   * Pull latest changes
   */
  async pull(): Promise<void> {
    await execAsync('git pull', { cwd: this.cwd });
  }

  /**
   * Fetch from remote
   */
  async fetch(): Promise<void> {
    await execAsync('git fetch', { cwd: this.cwd });
  }

  /**
   * Checkout a branch
   */
  async checkout(branch: string, options?: { create?: boolean }): Promise<void> {
    const flag = options?.create ? '-b' : '';
    await execAsync(`git checkout ${flag} ${branch}`, { cwd: this.cwd });
  }

  /**
   * Get remote URL
   */
  async getRemoteUrl(remote: string = 'origin'): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git remote get-url ${remote}`, { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if a branch exists locally
   */
  async branchExists(branch: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify ${branch}`, { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return !status.clean;
  }

  /**
   * Reset hard to HEAD
   */
  async resetHard(): Promise<void> {
    await execAsync('git reset --hard HEAD', { cwd: this.cwd });
  }

  /**
   * Clean untracked files
   */
  async clean(): Promise<void> {
    await execAsync('git clean -fd', { cwd: this.cwd });
  }

  /**
   * Get diff summary
   */
  async getDiffSummary(): Promise<{ files: number; insertions: number; deletions: number }> {
    try {
      const { stdout } = await execAsync('git diff --shortstat', { cwd: this.cwd });
      const match = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      if (match) {
        return {
          files: parseInt(match[1]) || 0,
          insertions: parseInt(match[2]) || 0,
          deletions: parseInt(match[3]) || 0,
        };
      }
    } catch {
      // Ignore errors
    }
    return { files: 0, insertions: 0, deletions: 0 };
  }

  /**
   * Create an auto-commit message based on changes
   */
  async generateCommitMessage(): Promise<string> {
    const diff = await this.getDiffSummary();
    const status = await this.getStatus();

    if (diff.files === 0) {
      return 'chore: no changes';
    }

    const parts: string[] = [];
    if (diff.insertions > 0) parts.push(`+${diff.insertions}`);
    if (diff.deletions > 0) parts.push(`-${diff.deletions}`);

    const summary = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    return `task: update ${diff.files} file${diff.files > 1 ? 's' : ''}${summary}`;
  }
}

/**
 * Create GitOperations instance for a directory
 */
export function createGitOperations(cwd: string): GitOperations {
  return new GitOperations(cwd);
}
