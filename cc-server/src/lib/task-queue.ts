import prisma from './prisma';
import { getWorkerManager } from './worker-manager';

export class TaskQueue {
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.processInterval) return;

    // Process queue every 5 seconds
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 5000);

    console.log('[TaskQueue] Started');
  }

  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    console.log('[TaskQueue] Stopped');
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      // Get pending tasks ordered by priority and creation time
      const pendingTasks = await prisma.task.findMany({
        where: { status: 'PENDING' },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        take: 10, // Process up to 10 tasks at a time
      });

      if (pendingTasks.length === 0) {
        this.isProcessing = false;
        return;
      }

      // Get online workers
      const onlineWorkers = await prisma.worker.findMany({
        where: { status: 'ONLINE' },
      });

      const workerManager = getWorkerManager();
      if (!workerManager) {
        this.isProcessing = false;
        return;
      }

      // Assign tasks to available workers
      for (const task of pendingTasks) {
        // Find an available worker (prefer specified worker if online)
        let targetWorker = null;

        if (task.workerId) {
          // Task has a specified worker
          targetWorker = onlineWorkers.find((w) => w.id === task.workerId);
        }

        if (!targetWorker) {
          // Find any online worker
          targetWorker = onlineWorkers.find((w) => w.status === 'ONLINE');
        }

        if (targetWorker) {
          // Assign task
          const assigned = await workerManager.assignTask(
            targetWorker.id,
            task.id,
            task.prompt
          );

          if (assigned) {
            // Update task with worker assignment
            await prisma.task.update({
              where: { id: task.id },
              data: { workerId: targetWorker.id },
            });

            // Mark worker as busy (optimistically)
            await prisma.worker.update({
              where: { id: targetWorker.id },
              data: { status: 'BUSY' },
            });

            // Remove from online workers list for next iteration
            const workerIndex = onlineWorkers.findIndex((w) => w.id === targetWorker!.id);
            if (workerIndex !== -1) {
              onlineWorkers.splice(workerIndex, 1);
            }

            console.log(`[TaskQueue] Assigned task ${task.id} to worker ${targetWorker.name}`);
          }
        }
      }
    } catch (error) {
      console.error('[TaskQueue] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Manually trigger queue processing
  async trigger(): Promise<void> {
    await this.processQueue();
  }
}

// Singleton instance
let taskQueue: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!taskQueue) {
    taskQueue = new TaskQueue();
  }
  return taskQueue;
}

export function initTaskQueue(): TaskQueue {
  const queue = getTaskQueue();
  queue.start();
  return queue;
}
