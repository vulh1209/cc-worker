import type { WorkerConfig } from '../config.js';
import type { TaskAssignEvent, TaskCancelEvent, WorkerRoutingInfo } from '../types/index.js';
import { WebSocketClient } from './WebSocketClient.js';
import { TaskExecutor } from './TaskExecutor.js';
import { OrchestratorExecutor } from './OrchestratorExecutor.js';
import { logger } from '../utils/logger.js';
import { getSystemInfo, formatSystemInfo } from '../utils/system-info.js';

/** Tracking info for a running task */
interface RunningTask {
  taskId: string;
  startedAt: Date;
  isWorktree: boolean;
}

export class WorkerClient {
  private config: WorkerConfig;
  private wsClient: WebSocketClient;
  private taskExecutor: TaskExecutor;
  private orchestratorExecutor: OrchestratorExecutor;
  private isRunning = false;

  // Multi-task support
  private runningTasks: Map<string, RunningTask> = new Map();
  private maxConcurrentTasks: number;
  private useWorktreeMode: boolean;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.wsClient = new WebSocketClient(config);
    this.taskExecutor = new TaskExecutor(config);
    this.orchestratorExecutor = new OrchestratorExecutor(config);

    // Multi-task configuration
    this.maxConcurrentTasks = config.maxConcurrentTasks || 1;
    // Enable worktree mode when maxConcurrentTasks > 1
    this.useWorktreeMode = this.maxConcurrentTasks > 1;

    if (this.useWorktreeMode) {
      logger.info(`[WorkerClient] Multi-task mode enabled: max ${this.maxConcurrentTasks} concurrent tasks with worktrees`);
    }

    this.setupEventHandlers();
  }

  /**
   * Check if worker can accept more tasks
   */
  private canAcceptTask(): boolean {
    return this.runningTasks.size < this.maxConcurrentTasks;
  }

  /**
   * Get current running task count
   */
  get runningTaskCount(): number {
    return this.runningTasks.size;
  }

  private setupEventHandlers(): void {
    // WebSocket connection events
    this.wsClient.on('connected', () => {
      logger.info('Connected to server successfully');
    });

    this.wsClient.on('disconnected', (reason: string) => {
      logger.warn(`Disconnected from server: ${reason}`);
    });

    this.wsClient.on('reconnecting', (attempt: number) => {
      logger.info(`Reconnecting... attempt ${attempt}`);
    });

    this.wsClient.on('error', (error: Error) => {
      logger.error('WebSocket error:', error.message);
    });

    // Task events
    this.wsClient.on('taskAssigned', (data: TaskAssignEvent) => {
      this.handleTaskAssigned(data);
    });

    this.wsClient.on('taskCancelled', (data: TaskCancelEvent) => {
      this.handleTaskCancelled(data);
    });
  }

  private async handleTaskAssigned(data: TaskAssignEvent): Promise<void> {
    const { taskId, prompt, sessionId, parentTaskId, taskType, availableWorkers, orchestrationDepth } = data;

    // Check if this is an orchestration task (REGULAR task sent to orchestrator)
    const isOrchestrationTask = this.config.isOrchestrator && taskType === 'REGULAR';

    // Check capacity based on mode
    if (isOrchestrationTask) {
      // Orchestrator tasks are still single-threaded
      if (this.orchestratorExecutor.isAnalyzing) {
        logger.warn(`Cannot accept orchestration task ${taskId}: already analyzing`);
        this.wsClient.sendTaskFailed({
          taskId,
          error: 'Orchestrator is busy with another analysis',
        });
        return;
      }
    } else {
      // For regular tasks, check multi-task capacity
      if (!this.canAcceptTask()) {
        logger.warn(`Cannot accept task ${taskId}: at capacity (${this.runningTasks.size}/${this.maxConcurrentTasks})`);
        this.wsClient.sendTaskFailed({
          taskId,
          error: `Worker at capacity (${this.runningTasks.size}/${this.maxConcurrentTasks} tasks)`,
        });
        return;
      }
    }

    // Update status to BUSY (if this is the first task or we're at capacity)
    if (this.runningTasks.size === 0 || this.runningTasks.size + 1 >= this.maxConcurrentTasks) {
      this.wsClient.updateStatus('BUSY');
    }

    if (isOrchestrationTask) {
      // Handle as orchestration task (blocking)
      await this.handleOrchestrationTask(taskId, prompt, orchestrationDepth || 0, availableWorkers || []);
      // Update status back to ONLINE after orchestration
      if (this.runningTasks.size === 0) {
        this.wsClient.updateStatus('ONLINE');
      }
    } else {
      // Handle as regular task execution (non-blocking for multi-task mode)
      // Don't await - let it run in background for parallel execution
      this.executeTaskAsync(taskId, prompt, sessionId, parentTaskId);
    }
  }

  /**
   * Execute task asynchronously (for multi-task support)
   */
  private async executeTaskAsync(
    taskId: string,
    prompt: string,
    sessionId?: string,
    parentTaskId?: string
  ): Promise<void> {
    // Track this task
    this.runningTasks.set(taskId, {
      taskId,
      startedAt: new Date(),
      isWorktree: this.useWorktreeMode,
    });

    try {
      await this.handleRegularTask(taskId, prompt, sessionId, parentTaskId);
    } finally {
      // Remove from tracking
      this.runningTasks.delete(taskId);

      // Update status to ONLINE if no more tasks
      if (this.runningTasks.size === 0) {
        this.wsClient.updateStatus('ONLINE');
      } else if (this.canAcceptTask()) {
        // Still have capacity, make sure we're not stuck in BUSY
        this.wsClient.updateStatus('ONLINE');
      }

      logger.info(`[WorkerClient] Task ${taskId} finished. Running: ${this.runningTasks.size}/${this.maxConcurrentTasks}`);
    }
  }

  /**
   * Handle orchestration analysis task
   */
  private async handleOrchestrationTask(
    taskId: string,
    prompt: string,
    orchestrationDepth: number,
    availableWorkers: WorkerRoutingInfo[]
  ): Promise<void> {
    logger.info(`[Orchestrator] Analyzing task ${taskId}`);

    // Notify server that task analysis has started
    this.wsClient.sendTaskStarted({ taskId });

    // Analyze the task
    const result = await this.orchestratorExecutor.analyze(
      taskId,
      prompt,
      50, // Default priority - could be passed from server
      orchestrationDepth,
      availableWorkers
    );

    if (result.success && result.decision) {
      // Send orchestration decision to server
      this.wsClient.sendOrchestrationDecision({
        taskId,
        decision: result.decision,
      });
      logger.info(`[Orchestrator] Decision sent for task ${taskId}: ${result.decision.action}`);
    } else {
      // On failure, send a fallback routing decision
      this.wsClient.sendOrchestrationDecision({
        taskId,
        decision: {
          action: 'route',
          targetWorkerId: availableWorkers.length > 0 ? availableWorkers[0].id : undefined,
          reasoning: result.error || 'Orchestration analysis failed, falling back to direct routing',
        },
      });
      logger.warn(`[Orchestrator] Fallback decision sent for task ${taskId}`);
    }
  }

  /**
   * Handle regular task execution
   */
  private async handleRegularTask(
    taskId: string,
    prompt: string,
    sessionId?: string,
    parentTaskId?: string
  ): Promise<void> {
    // Log if this is a follow-up task
    if (sessionId && parentTaskId) {
      logger.info(`Received follow-up task ${taskId} (parent: ${parentTaskId}, session: ${sessionId})`);
    }

    // Log multi-task status
    if (this.useWorktreeMode) {
      logger.info(`[WorkerClient] Starting task ${taskId} with worktree mode. Running: ${this.runningTasks.size}/${this.maxConcurrentTasks}`);
    }

    // Notify server that task has started
    this.wsClient.sendTaskStarted({ taskId });

    // Execute the task with optional session resume and worktree options
    const result = await this.taskExecutor.execute(
      taskId,
      prompt,
      (log) => {
        // Stream logs to server
        this.wsClient.sendTaskLog({
          taskId,
          type: log.type,
          content: log.content,
          timestamp: new Date().toISOString(),
        });
      },
      sessionId,  // Pass sessionId for resume
      {
        // Use worktree mode when multi-task is enabled
        useWorktree: this.useWorktreeMode,
        // Auto-commit changes when using worktree
        autoCommit: this.useWorktreeMode,
      }
    );

    // Send result to server
    if (result.success) {
      this.wsClient.sendTaskCompleted({
        taskId,
        result: result.result || 'Task completed',
        duration: result.duration,
        sessionId: result.sessionId,  // Include session ID for future resume
      });
    } else {
      this.wsClient.sendTaskFailed({
        taskId,
        error: result.error || 'Unknown error',
      });
    }
  }

  private handleTaskCancelled(data: TaskCancelEvent): void {
    const { taskId } = data;

    // Check if task is running
    if (this.runningTasks.has(taskId)) {
      const cancelled = this.taskExecutor.cancel();
      if (cancelled) {
        logger.info(`Task ${taskId} cancelled successfully`);
        this.runningTasks.delete(taskId);
      }
    } else if (this.taskExecutor.currentTask === taskId) {
      // Fallback for single-task mode
      const cancelled = this.taskExecutor.cancel();
      if (cancelled) {
        logger.info(`Task ${taskId} cancelled successfully`);
      }
    } else {
      logger.warn(`Cannot cancel task ${taskId}: not currently executing`);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Worker is already running');
      return;
    }

    // Display startup info
    this.displayStartupBanner();

    try {
      // Connect to server
      await this.wsClient.connect();
      this.isRunning = true;

      logger.info('Worker is now ready to receive tasks');

      // Keep the process running
      await this.keepAlive();
    } catch (error) {
      logger.error('Failed to start worker:', error);
      throw error;
    }
  }

  private displayStartupBanner(): void {
    const systemInfo = getSystemInfo();
    const modeLabel = this.config.isOrchestrator ? 'ORCHESTRATOR' : 'WORKER';

    console.log('\n' + '═'.repeat(50));
    console.log(`  CC-Worker - Distributed Claude Code ${modeLabel}`);
    console.log('═'.repeat(50));
    console.log();
    console.log(`  Worker Name: ${this.config.workerName}`);
    console.log(`  Mode: ${this.config.isOrchestrator ? 'Orchestrator (task routing)' : 'Worker (task execution)'}`);
    console.log(`  Server: ${this.config.serverUrl}`);
    console.log(`  Working Dir: ${this.config.workingDirectory}`);
    // Show multi-task info
    if (this.useWorktreeMode) {
      console.log(`  Multi-Task: Enabled (max ${this.maxConcurrentTasks} concurrent tasks)`);
      console.log(`  Worktree Mode: Enabled (isolated execution)`);
    } else {
      console.log(`  Multi-Task: Disabled (single task mode)`);
    }
    console.log();
    console.log('  System Info:');
    formatSystemInfo(systemInfo).split('\n').forEach((line) => {
      console.log(`    ${line}`);
    });
    console.log();
    console.log('═'.repeat(50) + '\n');
  }

  private async keepAlive(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Handle process termination
      const shutdown = async () => {
        logger.info('Shutting down worker...');
        await this.stop();
        resolve();
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Handle uncaught errors
      process.on('uncaughtException', async (error) => {
        logger.error('Uncaught exception:', error);
        await this.stop();
        reject(error);
      });

      process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection:', reason);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping worker...');

    // Cancel any running tasks
    if (this.taskExecutor.isExecuting) {
      this.taskExecutor.cancel();
    }

    // Clear running tasks tracking
    this.runningTasks.clear();

    // Cleanup worktrees if in worktree mode
    if (this.useWorktreeMode) {
      logger.info('Cleaning up worktrees...');
      try {
        await this.taskExecutor.cleanupAllWorktrees();
      } catch (error) {
        logger.warn('Failed to cleanup worktrees:', error);
      }
    }

    // Disconnect from server
    this.wsClient.disconnect();
    this.isRunning = false;

    logger.info('Worker stopped');
  }

  get running(): boolean {
    return this.isRunning;
  }

  get connected(): boolean {
    return this.wsClient.connected;
  }
}
