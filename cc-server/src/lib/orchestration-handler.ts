import prisma from './prisma';
import { getWorkerManager } from './worker-manager';
import type { OrchestrationDecisionEvent, SubtaskDefinition } from '../types';

const MAX_ORCHESTRATION_DEPTH = parseInt(process.env.ORCHESTRATION_MAX_DEPTH || '3');

export class OrchestrationHandler {
  /**
   * Handle orchestration decision from orchestrator worker
   */
  async handleDecision(data: OrchestrationDecisionEvent): Promise<void> {
    const { taskId, decision } = data;

    console.log(`[Orchestration] Received decision for task ${taskId}: ${decision.action}`);

    try {
      // Store the decision
      await prisma.task.update({
        where: { id: taskId },
        data: { routingDecision: decision as any },
      });

      switch (decision.action) {
        case 'route':
          await this.handleRouteDecision(taskId, decision.targetWorkerId, decision.reasoning);
          break;
        case 'adjust_priority':
          await this.handlePriorityDecision(taskId, decision.newPriority, decision.reasoning);
          break;
        case 'decompose':
          await this.handleDecomposeDecision(taskId, decision.subtasks || [], decision.reasoning);
          break;
        default:
          console.error(`[Orchestration] Unknown action: ${decision.action}`);
          // Fallback: route to any available worker
          await this.handleRouteDecision(taskId, undefined, 'Fallback due to unknown action');
      }
    } catch (error) {
      console.error(`[Orchestration] Error handling decision for task ${taskId}:`, error);
      // On error, mark task as pending again for retry
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'PENDING' },
      });
    }
  }

  /**
   * Route task to a specific worker
   */
  private async handleRouteDecision(
    taskId: string,
    targetWorkerId: string | undefined,
    reasoning: string
  ): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { parentTask: { select: { sessionId: true } } },
    });

    if (!task) {
      console.error(`[Orchestration] Task ${taskId} not found`);
      return;
    }

    // Find target worker
    let worker = null;
    if (targetWorkerId) {
      worker = await prisma.worker.findFirst({
        where: { id: targetWorkerId, status: 'ONLINE', isOrchestrator: false },
      });
    }

    // Fallback: find any available worker (non-orchestrator)
    if (!worker) {
      worker = await prisma.worker.findFirst({
        where: { status: 'ONLINE', isOrchestrator: false },
      });
    }

    if (!worker) {
      console.log(`[Orchestration] No available workers for task ${taskId}, keeping in queue`);
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'PENDING',
          taskType: 'SUBTASK', // Skip orchestration next time - already routed
        },
      });
      return;
    }

    // Assign task to worker
    const workerManager = getWorkerManager();
    if (!workerManager) {
      console.error('[Orchestration] WorkerManager not available');
      return;
    }

    const assigned = await workerManager.assignTask(
      worker.id,
      taskId,
      task.prompt,
      task.parentTask?.sessionId ?? undefined,
      task.parentTaskId ?? undefined,
      'SUBTASK', // Mark as subtask so it skips orchestration
      task.orchestrationDepth
    );

    if (assigned) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          workerId: worker.id,
          taskType: 'SUBTASK', // Skip future orchestration
        },
      });

      await prisma.worker.update({
        where: { id: worker.id },
        data: { status: 'BUSY' },
      });

      console.log(`[Orchestration] Routed task ${taskId} to ${worker.name} - ${reasoning}`);
    } else {
      // Failed to assign, put back in queue
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'PENDING' },
      });
    }
  }

  /**
   * Adjust task priority and put back in queue
   */
  private async handlePriorityDecision(
    taskId: string,
    newPriority: number | undefined,
    reasoning: string
  ): Promise<void> {
    if (newPriority === undefined) {
      console.error(`[Orchestration] No priority specified for task ${taskId}`);
      return;
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        priority: newPriority,
        status: 'PENDING', // Back to queue with new priority
        taskType: 'SUBTASK', // Skip orchestration next time
      },
    });

    console.log(`[Orchestration] Adjusted priority for task ${taskId} to ${newPriority} - ${reasoning}`);
  }

  /**
   * Decompose task into subtasks
   */
  private async handleDecomposeDecision(
    taskId: string,
    subtasks: SubtaskDefinition[],
    reasoning: string
  ): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      console.error(`[Orchestration] Task ${taskId} not found for decomposition`);
      return;
    }

    // Check depth limit
    if (task.orchestrationDepth >= MAX_ORCHESTRATION_DEPTH) {
      console.log(`[Orchestration] Max depth reached for task ${taskId}, routing directly`);
      await this.handleRouteDecision(taskId, undefined, 'Max orchestration depth reached');
      return;
    }

    if (subtasks.length === 0) {
      console.error(`[Orchestration] No subtasks provided for decomposition of task ${taskId}`);
      await this.handleRouteDecision(taskId, undefined, 'No subtasks provided');
      return;
    }

    // Create subtasks
    const createdSubtasks = await Promise.all(
      subtasks.map(async (subtask) => {
        return prisma.task.create({
          data: {
            prompt: subtask.prompt,
            priority: subtask.priority,
            status: 'PENDING',
            taskType: 'SUBTASK', // Skip orchestration
            orchestratedByTaskId: taskId,
            orchestrationDepth: task.orchestrationDepth + 1,
            workerId: subtask.preferredWorkerId || null,
          },
        });
      })
    );

    // Mark parent task as completed (orchestration done)
    // The result will be aggregated when all subtasks complete
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        result: `Decomposed into ${subtasks.length} subtasks`,
      },
    });

    console.log(
      `[Orchestration] Decomposed task ${taskId} into ${subtasks.length} subtasks - ${reasoning}`
    );

    // Log created subtask IDs
    createdSubtasks.forEach((st, i) => {
      console.log(`  Subtask ${i + 1}: ${st.id} (priority: ${st.priority})`);
    });
  }

  /**
   * Check if all subtasks of a parent task are completed
   * and aggregate results if so
   */
  async checkSubtaskCompletion(parentTaskId: string): Promise<void> {
    const subtasks = await prisma.task.findMany({
      where: { orchestratedByTaskId: parentTaskId },
    });

    if (subtasks.length === 0) return;

    const allCompleted = subtasks.every(
      (st) => st.status === 'COMPLETED' || st.status === 'FAILED'
    );

    if (!allCompleted) return;

    // Aggregate results
    const results = subtasks
      .filter((st) => st.status === 'COMPLETED')
      .map((st) => st.result)
      .filter(Boolean);

    const failures = subtasks.filter((st) => st.status === 'FAILED');

    const aggregatedResult = {
      subtaskCount: subtasks.length,
      completedCount: results.length,
      failedCount: failures.length,
      results,
      errors: failures.map((f) => ({ id: f.id, error: f.errorMessage })),
    };

    await prisma.task.update({
      where: { id: parentTaskId },
      data: {
        result: JSON.stringify(aggregatedResult, null, 2),
      },
    });

    console.log(
      `[Orchestration] Aggregated results for parent task ${parentTaskId}: ${results.length}/${subtasks.length} completed`
    );
  }
}

// Singleton
let orchestrationHandler: OrchestrationHandler | null = null;

export function getOrchestrationHandler(): OrchestrationHandler {
  if (!orchestrationHandler) {
    orchestrationHandler = new OrchestrationHandler();
  }
  return orchestrationHandler;
}
