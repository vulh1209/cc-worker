import prisma from './prisma';
import { getWorkerManager } from './worker-manager';
import type { TaskType } from '../types';

// Fallback mode when orchestrator is unavailable
const FALLBACK_MODE = (process.env.ORCHESTRATION_FALLBACK_MODE || 'hybrid') as 'queue' | 'fallback' | 'hybrid';

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
      // Include parent task's sessionId for follow-up session continuity
      const pendingTasks = await prisma.task.findMany({
        where: { status: 'PENDING' },
        include: {
          parentTask: {
            select: { sessionId: true },
          },
        },
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

      const workerManager = getWorkerManager();
      if (!workerManager) {
        this.isProcessing = false;
        return;
      }

      // Check for orchestrator worker
      const orchestrator = await prisma.worker.findFirst({
        where: { isOrchestrator: true, status: 'ONLINE' },
      });

      // Get online workers (non-orchestrator)
      const onlineWorkers = await prisma.worker.findMany({
        where: { status: 'ONLINE', isOrchestrator: false },
      });

      // Assign tasks to available workers
      for (const task of pendingTasks) {
        const taskType = task.taskType as TaskType;

        // Determine if task should go through orchestration
        const shouldOrchestrate = taskType === 'REGULAR' && orchestrator;
        const canFallback = FALLBACK_MODE === 'fallback' ||
          (FALLBACK_MODE === 'hybrid' && task.priority < 50);

        // Find target worker
        let targetWorker = null;

        if (shouldOrchestrate) {
          // Route REGULAR tasks to orchestrator for analysis
          targetWorker = orchestrator;
        } else if (task.workerId) {
          // Task has a specified worker
          targetWorker = onlineWorkers.find((w) => w.id === task.workerId);
        }

        if (!targetWorker && (taskType !== 'REGULAR' || canFallback || !orchestrator)) {
          // Find any online worker for:
          // - SUBTASK or ORCHESTRATION_ANALYSIS types
          // - REGULAR tasks when orchestrator unavailable and fallback allowed
          targetWorker = onlineWorkers.find((w) => w.status === 'ONLINE');
        }

        if (!targetWorker) {
          // No worker available, skip this task
          continue;
        }

        // Determine task status based on routing
        const newStatus = targetWorker.isOrchestrator ? 'ORCHESTRATING' : 'RUNNING';

        // Assign task with session info for follow-up continuity
        const assigned = await workerManager.assignTask(
          targetWorker.id,
          task.id,
          task.prompt,
          task.parentTask?.sessionId ?? undefined,
          task.parentTaskId ?? undefined,
          taskType,
          task.orchestrationDepth
        );

        if (assigned) {
          // Update task with worker assignment
          await prisma.task.update({
            where: { id: task.id },
            data: {
              workerId: targetWorker.id,
              status: newStatus,
              startedAt: new Date(),
            },
          });

          // Mark worker as busy (optimistically)
          await prisma.worker.update({
            where: { id: targetWorker.id },
            data: { status: 'BUSY' },
          });

          // Remove from online workers list for next iteration
          if (!targetWorker.isOrchestrator) {
            const workerIndex = onlineWorkers.findIndex((w) => w.id === targetWorker!.id);
            if (workerIndex !== -1) {
              onlineWorkers.splice(workerIndex, 1);
            }
          }

          // Log assignment
          if (targetWorker.isOrchestrator) {
            console.log(`[TaskQueue] Sent task ${task.id} to orchestrator for analysis`);
          } else if (task.parentTaskId) {
            console.log(`[TaskQueue] Assigned follow-up ${task.id} to ${targetWorker.name} (parent: ${task.parentTaskId})`);
          } else {
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
