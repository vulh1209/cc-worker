import { query, type SDKMessage, type SDKAssistantMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { WorkerConfig } from '../config.js';
import type { LogType, TaskLogEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { PreflightChecker } from './PreflightChecker.js';
import { WorktreeManager, GitOperations } from '../git/index.js';

// Content block types from Anthropic SDK
type TextBlock = { type: 'text'; text: string };
type ThinkingBlock = { type: 'thinking'; thinking: string };
type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean };
type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | { type: string };

export interface TaskExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
  sessionId?: string;  // Session ID for future resume
}

export interface TaskLogCallback {
  (log: Omit<TaskLogEvent, 'taskId' | 'timestamp'>): void;
}

export interface TaskExecuteOptions {
  /** Type of task being executed */
  taskType?: string;
  /** Skip preflight checks */
  skipPreflight?: boolean;
  /** Custom working directory (overrides config) */
  workingDirectory?: string;
  /** Use worktree mode for isolated execution */
  useWorktree?: boolean;
  /** Base branch for worktree (default: main) */
  baseBranch?: string;
  /** Whether to auto-commit and push changes after execution */
  autoCommit?: boolean;
}

export class TaskExecutor {
  private config: WorkerConfig;
  private abortController: AbortController | null = null;
  private currentTaskId: string | null = null;
  private preflightChecker: PreflightChecker;
  private worktreeManager: WorktreeManager | null = null;
  private activeWorktrees: Map<string, string> = new Map(); // taskId -> worktreePath

  constructor(config: WorkerConfig) {
    this.config = config;
    this.preflightChecker = new PreflightChecker();

    // Initialize worktree manager if working directory is set
    if (config.workingDirectory) {
      this.worktreeManager = new WorktreeManager(config.workingDirectory);
    }
  }

  /**
   * Get the worktree manager instance
   */
  getWorktreeManager(): WorktreeManager | null {
    return this.worktreeManager;
  }

  /**
   * Get active worktrees map
   */
  getActiveWorktrees(): Map<string, string> {
    return new Map(this.activeWorktrees);
  }

  async execute(
    taskId: string,
    prompt: string,
    onLog: TaskLogCallback,
    resumeSessionId?: string,  // Optional session ID to resume
    options?: TaskExecuteOptions
  ): Promise<TaskExecutionResult> {
    this.currentTaskId = taskId;
    this.abortController = new AbortController();

    const startTime = Date.now();
    let finalResult = '';
    let capturedSessionId: string | undefined;

    logger.taskStart(taskId, prompt);

    // Emit system log for task start
    onLog({
      type: 'SYSTEM',
      content: {
        message: resumeSessionId
          ? 'Resuming session with follow-up prompt'
          : 'Task execution started',
        prompt: prompt.substring(0, 200),
        ...(resumeSessionId && { resumeSessionId }),
      },
    });

    let worktreePath: string | null = null;
    const useWorktree = options?.useWorktree ?? false;

    try {
      // Validate base working directory
      let baseCwd = options?.workingDirectory || this.config.workingDirectory;
      if (!baseCwd || typeof baseCwd !== 'string') {
        throw new Error(`Invalid working directory: ${baseCwd}. Please set CC_WORKING_DIR environment variable.`);
      }

      // Normalize path for Windows (convert forward slashes to backslashes if on Windows)
      if (process.platform === 'win32' && baseCwd.includes('/')) {
        baseCwd = baseCwd.replace(/\//g, '\\');
        logger.info(`Normalized Windows path: ${baseCwd}`);
      }

      // Determine actual working directory (worktree or base)
      let cwd = baseCwd;

      // Create worktree if requested
      if (useWorktree && this.worktreeManager) {
        onLog({
          type: 'SYSTEM',
          content: { message: 'Creating isolated worktree for task...' },
        });

        try {
          worktreePath = await this.worktreeManager.createWorktree(taskId, {
            baseBranch: options?.baseBranch || 'main',
          });
          this.activeWorktrees.set(taskId, worktreePath);
          cwd = worktreePath;

          onLog({
            type: 'SYSTEM',
            content: {
              message: 'Worktree created successfully',
              worktreePath,
              branch: `nightshift/task_${taskId}`,
            },
          });
        } catch (worktreeError) {
          const errorMsg = worktreeError instanceof Error ? worktreeError.message : String(worktreeError);
          logger.error(`[Worktree] Failed to create worktree: ${errorMsg}`);
          onLog({
            type: 'ERROR',
            content: { message: `Failed to create worktree: ${errorMsg}` },
          });
          throw new Error(`Worktree creation failed: ${errorMsg}`);
        }
      }

      logger.info(`Using working directory: ${cwd}${useWorktree ? ' (worktree)' : ''}`);

      // Run preflight checks (unless skipped)
      if (!options?.skipPreflight) {
        onLog({
          type: 'SYSTEM',
          content: { message: 'Running preflight checks...' },
        });

        const preflightResult = await this.preflightChecker.runChecks({
          repoPath: cwd,
          taskType: options?.taskType,
          // Skip git clean check for worktrees (they start clean)
          skipChecks: useWorktree ? { gitClean: true } : undefined,
        });

        // Log preflight result
        onLog({
          type: 'SYSTEM',
          content: {
            message: preflightResult.passed ? 'Preflight checks passed' : 'Preflight checks failed',
            checks: preflightResult.checks,
            duration: preflightResult.duration,
            ...(preflightResult.warnings.length > 0 && { warnings: preflightResult.warnings }),
          },
        });

        if (!preflightResult.passed) {
          const errorMsg = `Preflight failed: ${preflightResult.errors.join('; ')}`;
          logger.error(`[Preflight] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        // Log warnings if any
        for (const warning of preflightResult.warnings) {
          logger.warn(`[Preflight] Warning: ${warning}`);
        }
      }

      // Build query options with optional session resume
      const queryOptions: Parameters<typeof query>[0]['options'] = {
        abortController: this.abortController,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS'],
        cwd,
        maxTurns: 50, // Limit to prevent runaway tasks
        dangerouslySkipPermissions: true, // Skip permission prompts for headless worker execution
        ...(this.config.cliPath && { pathToClaudeCodeExecutable: this.config.cliPath }),
      };

      if (this.config.cliPath) {
        logger.info(`Using CLI path: ${this.config.cliPath}`);
      }

      // Add resume option if session ID provided
      if (resumeSessionId) {
        queryOptions.resume = resumeSessionId;
        logger.info(`Resuming session: ${resumeSessionId}`);
      }

      // Debug log the full query options
      logger.info(`Query options: ${JSON.stringify({
        prompt: prompt.substring(0, 100),
        cwd: queryOptions.cwd,
        maxTurns: queryOptions.maxTurns,
        allowedTools: queryOptions.allowedTools,
        resume: queryOptions.resume,
      })}`);

      // Execute Claude query with streaming
      for await (const message of query({
        prompt,
        options: queryOptions,
      })) {
        // Check for abort
        if (this.abortController.signal.aborted) {
          throw new Error('Task cancelled');
        }

        // Capture session_id from messages
        if ('session_id' in message && message.session_id) {
          capturedSessionId = message.session_id as string;
        }

        // Process message based on type
        await this.processMessage(message, onLog);

        // Capture final result from assistant messages
        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          if (assistantMsg.message?.content) {
            const textContent = this.extractTextContent(assistantMsg.message.content as ContentBlock[]);
            if (textContent) {
              finalResult = textContent;
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.taskComplete(taskId, duration);

      // Handle auto-commit and push for worktree mode
      if (useWorktree && worktreePath && options?.autoCommit) {
        onLog({
          type: 'SYSTEM',
          content: { message: 'Auto-committing and pushing changes...' },
        });

        try {
          const gitOps = new GitOperations(worktreePath);
          const hasChanges = await gitOps.hasUncommittedChanges();

          if (hasChanges) {
            const commitMsg = await gitOps.generateCommitMessage();
            const commit = await gitOps.stageAndCommit(commitMsg);

            if (commit) {
              onLog({
                type: 'SYSTEM',
                content: {
                  message: 'Changes committed',
                  commit: commit.shortHash,
                  commitMessage: commit.message,
                },
              });

              // Push to remote
              await gitOps.push({ setUpstream: true });
              onLog({
                type: 'SYSTEM',
                content: { message: 'Changes pushed to remote' },
              });
            }
          } else {
            onLog({
              type: 'SYSTEM',
              content: { message: 'No changes to commit' },
            });
          }
        } catch (gitError) {
          const gitErrorMsg = gitError instanceof Error ? gitError.message : String(gitError);
          logger.warn(`[Git] Auto-commit failed: ${gitErrorMsg}`);
          onLog({
            type: 'SYSTEM',
            content: { message: `Auto-commit failed: ${gitErrorMsg}` },
          });
        }
      }

      onLog({
        type: 'SYSTEM',
        content: { message: 'Task completed successfully', sessionId: capturedSessionId },
      });

      return {
        success: true,
        result: finalResult || 'Task completed',
        duration,
        sessionId: capturedSessionId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.taskFailed(taskId, errorMessage);

      onLog({
        type: 'ERROR',
        content: { message: errorMessage },
      });

      return {
        success: false,
        error: errorMessage,
        duration,
        sessionId: capturedSessionId,  // Return session even on failure
      };
    } finally {
      // Cleanup worktree if used
      if (useWorktree && worktreePath && this.worktreeManager) {
        try {
          await this.worktreeManager.removeWorktree(taskId, { deleteBranch: false });
          this.activeWorktrees.delete(taskId);
          logger.info(`[Worktree] Cleaned up worktree for task ${taskId}`);
        } catch (cleanupError) {
          logger.warn(`[Worktree] Failed to cleanup worktree: ${cleanupError}`);
        }
      }

      this.abortController = null;
      this.currentTaskId = null;
    }
  }

  private async processMessage(message: SDKMessage, onLog: TaskLogCallback): Promise<void> {
    switch (message.type) {
      case 'assistant':
        await this.processAssistantMessage(message as SDKAssistantMessage, onLog);
        break;

      case 'user':
        // User messages are typically tool results
        const userMsg = message as SDKUserMessage;
        if (userMsg.message?.content) {
          this.processToolResults(userMsg.message.content as ContentBlock[], onLog);
        }
        break;

      case 'result':
        // Final result message
        onLog({
          type: 'SYSTEM',
          content: { message: 'Execution completed', result: message },
        });
        break;
    }
  }

  private async processAssistantMessage(
    message: SDKAssistantMessage,
    onLog: TaskLogCallback
  ): Promise<void> {
    if (!message.message?.content) return;

    for (const block of message.message.content as ContentBlock[]) {
      if (block.type === 'text') {
        // Regular text output
        const textBlock = block as TextBlock;
        onLog({
          type: 'TEXT',
          content: { text: textBlock.text },
        });
      } else if (block.type === 'thinking') {
        // Extended thinking content
        const thinkingBlock = block as ThinkingBlock;
        onLog({
          type: 'THINKING',
          content: { thinking: thinkingBlock.thinking },
        });
      } else if (block.type === 'tool_use') {
        // Tool invocation
        const toolUseBlock = block as ToolUseBlock;
        onLog({
          type: 'TOOL_USE',
          content: {
            tool: toolUseBlock.name,
            id: toolUseBlock.id,
            input: this.sanitizeToolInput(toolUseBlock.input),
          },
        });
      }
    }
  }

  private processToolResults(
    content: ContentBlock[],
    onLog: TaskLogCallback
  ): void {
    for (const block of content) {
      if (block.type === 'tool_result') {
        const toolResultBlock = block as ToolResultBlock;
        onLog({
          type: 'TOOL_RESULT',
          content: {
            toolUseId: toolResultBlock.tool_use_id,
            result: this.truncateContent(toolResultBlock.content),
            isError: toolResultBlock.is_error,
          },
        });
      }
    }
  }

  private extractTextContent(content: ContentBlock[]): string {
    const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');
    return textBlocks.map((block) => block.text).join('\n');
  }

  private sanitizeToolInput(input: unknown): unknown {
    // Truncate large inputs to avoid overwhelming logs
    if (typeof input === 'string' && input.length > 1000) {
      return input.substring(0, 1000) + '... (truncated)';
    }
    if (typeof input === 'object' && input !== null) {
      const str = JSON.stringify(input);
      if (str.length > 1000) {
        // Try to parse truncated JSON, fallback to string if invalid
        try {
          return JSON.parse(str.substring(0, 1000) + '"}');
        } catch {
          return str.substring(0, 1000) + '... (truncated)';
        }
      }
    }
    return input;
  }

  private truncateContent(content: unknown): unknown {
    if (typeof content === 'string' && content.length > 500) {
      return content.substring(0, 500) + '... (truncated)';
    }
    return content;
  }

  cancel(): boolean {
    if (this.abortController && this.currentTaskId) {
      logger.info(`Cancelling task: ${this.currentTaskId}`);
      this.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Cleanup all active worktrees (call during shutdown)
   */
  async cleanupAllWorktrees(): Promise<void> {
    if (!this.worktreeManager) return;

    logger.info('[TaskExecutor] Cleaning up all active worktrees...');

    for (const [taskId] of this.activeWorktrees) {
      try {
        await this.worktreeManager.removeWorktree(taskId, { deleteBranch: false });
        logger.info(`[TaskExecutor] Cleaned up worktree for task ${taskId}`);
      } catch (error) {
        logger.warn(`[TaskExecutor] Failed to cleanup worktree for task ${taskId}: ${error}`);
      }
    }

    this.activeWorktrees.clear();

    // Also cleanup any stale worktrees
    try {
      await this.worktreeManager.cleanupStale(24); // 24 hours
    } catch (error) {
      logger.warn(`[TaskExecutor] Failed to cleanup stale worktrees: ${error}`);
    }
  }

  get isExecuting(): boolean {
    return this.currentTaskId !== null;
  }

  get currentTask(): string | null {
    return this.currentTaskId;
  }

  get activeWorktreeCount(): number {
    return this.activeWorktrees.size;
  }
}
