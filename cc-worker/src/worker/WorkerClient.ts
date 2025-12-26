import type { WorkerConfig } from '../config.js';
import type { TaskAssignEvent, TaskCancelEvent } from '../types/index.js';
import { WebSocketClient } from './WebSocketClient.js';
import { TaskExecutor } from './TaskExecutor.js';
import { logger } from '../utils/logger.js';
import { getSystemInfo, formatSystemInfo } from '../utils/system-info.js';

export class WorkerClient {
  private config: WorkerConfig;
  private wsClient: WebSocketClient;
  private taskExecutor: TaskExecutor;
  private isRunning = false;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.wsClient = new WebSocketClient(config);
    this.taskExecutor = new TaskExecutor(config);

    this.setupEventHandlers();
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
    const { taskId, prompt, sessionId, parentTaskId } = data;

    // Check if already executing a task
    if (this.taskExecutor.isExecuting) {
      logger.warn(`Cannot accept task ${taskId}: already executing ${this.taskExecutor.currentTask}`);
      this.wsClient.sendTaskFailed({
        taskId,
        error: 'Worker is busy with another task',
      });
      return;
    }

    // Log if this is a follow-up task
    if (sessionId && parentTaskId) {
      logger.info(`Received follow-up task ${taskId} (parent: ${parentTaskId}, session: ${sessionId})`);
    }

    // Update status to BUSY
    this.wsClient.updateStatus('BUSY');

    // Notify server that task has started
    this.wsClient.sendTaskStarted({ taskId });

    // Execute the task with optional session resume
    const result = await this.taskExecutor.execute(taskId, prompt, (log) => {
      // Stream logs to server
      this.wsClient.sendTaskLog({
        taskId,
        type: log.type,
        content: log.content,
        timestamp: new Date().toISOString(),
      });
    }, sessionId);  // Pass sessionId for resume

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

    // Update status back to ONLINE
    this.wsClient.updateStatus('ONLINE');
  }

  private handleTaskCancelled(data: TaskCancelEvent): void {
    const { taskId } = data;

    if (this.taskExecutor.currentTask === taskId) {
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

    console.log('\n' + '═'.repeat(50));
    console.log('  CC-Worker - Distributed Claude Code Worker');
    console.log('═'.repeat(50));
    console.log();
    console.log(`  Worker Name: ${this.config.workerName}`);
    console.log(`  Server: ${this.config.serverUrl}`);
    console.log(`  Working Dir: ${this.config.workingDirectory}`);
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
        this.stop();
        resolve();
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Handle uncaught errors
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        this.stop();
        reject(error);
      });

      process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection:', reason);
      });
    });
  }

  stop(): void {
    if (!this.isRunning) return;

    logger.info('Stopping worker...');

    // Cancel any running task
    if (this.taskExecutor.isExecuting) {
      this.taskExecutor.cancel();
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
