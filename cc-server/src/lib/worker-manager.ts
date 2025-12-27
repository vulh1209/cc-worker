import { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  ServerToWorkerEvents,
  WorkerToServerEvents,
  ServerToBrowserEvents,
  BrowserToServerEvents,
  WorkerRegisterEvent,
  WorkerHeartbeatEvent,
  TaskLogEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskStartedEvent,
  OrchestrationDecisionEvent,
  TaskType,
  WorkerRoutingInfo,
} from '../types';
import prisma from './prisma';
import { getOrchestrationHandler } from './orchestration-handler';
import { handlePRReviewCompleted, handlePRReviewFailed } from './pr-review-handler';

type WorkerSocket = Socket<WorkerToServerEvents, ServerToWorkerEvents>;
type BrowserSocket = Socket<BrowserToServerEvents, ServerToBrowserEvents>;

interface ConnectedWorker {
  socket: WorkerSocket;
  workerId: string;
  name: string;
  lastHeartbeat: Date;
}

// Heartbeat timeout: mark worker offline if no heartbeat for 90 seconds
// (Worker sends heartbeat every 30s, so 90s allows for 2 missed heartbeats)
const HEARTBEAT_TIMEOUT_MS = 90_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 30_000;

export class WorkerManager {
  private io: SocketIOServer;
  private workers: Map<string, ConnectedWorker> = new Map(); // socketId -> worker
  private workerIdToSocket: Map<string, string> = new Map(); // workerId -> socketId
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
    this.startHeartbeatMonitor();
    this.cleanupStaleWorkersOnStartup();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[Socket] New connection: ${socket.id}`);

      // Handle worker registration
      socket.on('worker:register', async (data: WorkerRegisterEvent) => {
        await this.handleWorkerRegister(socket as WorkerSocket, data);
      });

      // Handle worker heartbeat
      socket.on('worker:heartbeat', async (data: WorkerHeartbeatEvent) => {
        await this.handleWorkerHeartbeat(socket as WorkerSocket, data);
      });

      // Handle task events
      socket.on('task:started', async (data: TaskStartedEvent) => {
        await this.handleTaskStarted(socket as WorkerSocket, data);
      });

      socket.on('task:log', async (data: TaskLogEvent) => {
        await this.handleTaskLog(socket as WorkerSocket, data);
      });

      socket.on('task:completed', async (data: TaskCompletedEvent) => {
        await this.handleTaskCompleted(socket as WorkerSocket, data);
      });

      socket.on('task:failed', async (data: TaskFailedEvent) => {
        await this.handleTaskFailed(socket as WorkerSocket, data);
      });

      // Handle orchestration decision from orchestrator worker
      socket.on('orchestration:decision', async (data: OrchestrationDecisionEvent) => {
        await this.handleOrchestrationDecision(socket as WorkerSocket, data);
      });

      // Handle browser subscriptions
      socket.on('subscribe:task', (taskId: string) => {
        socket.join(`task:${taskId}`);
      });

      socket.on('unsubscribe:task', (taskId: string) => {
        socket.leave(`task:${taskId}`);
      });

      socket.on('subscribe:worker', (workerId: string) => {
        socket.join(`worker:${workerId}`);
      });

      socket.on('unsubscribe:worker', (workerId: string) => {
        socket.leave(`worker:${workerId}`);
      });

      // Handle disconnect
      socket.on('disconnect', async () => {
        await this.handleDisconnect(socket as WorkerSocket);
      });
    });
  }

  private async handleWorkerRegister(
    socket: WorkerSocket,
    data: WorkerRegisterEvent
  ): Promise<void> {
    try {
      // Find worker by API key
      const worker = await prisma.worker.findUnique({
        where: { apiKey: data.apiKey },
      });

      if (!worker) {
        socket.emit('error', { message: 'Invalid API key' });
        socket.disconnect();
        return;
      }

      // Check if worker wants to be orchestrator
      let shouldBeOrchestrator = data.isOrchestrator ?? false;

      // If worker wants to be orchestrator, check if another orchestrator already exists
      if (shouldBeOrchestrator) {
        const existingOrchestrator = await prisma.worker.findFirst({
          where: { isOrchestrator: true, id: { not: worker.id } },
        });
        if (existingOrchestrator) {
          console.log(`[Worker] ${worker.name} wants to be orchestrator, but ${existingOrchestrator.name} is already orchestrator`);
          shouldBeOrchestrator = false; // Deny, keep existing orchestrator
        }
      }

      // Update worker info
      const updatedWorker = await prisma.worker.update({
        where: { id: worker.id },
        data: {
          status: 'ONLINE',
          os: data.os,
          hostname: data.hostname,
          lastSeen: new Date(),
          isOrchestrator: shouldBeOrchestrator,
        },
      });

      // Track connected worker
      this.workers.set(socket.id, {
        socket,
        workerId: worker.id,
        name: worker.name,
        lastHeartbeat: new Date(),
      });
      this.workerIdToSocket.set(worker.id, socket.id);

      // Join worker room
      socket.join(`worker:${worker.id}`);

      // Broadcast worker update to dashboard
      this.io.emit('worker:updated', updatedWorker);

      // Handle assigned repos from worker config - sync to WorkerRepository table
      const configRepos = data.assignedRepos || [];
      if (configRepos.length > 0) {
        await this.syncWorkerRepoAssignments(worker.id, configRepos);
      }

      const repoInfo = configRepos.length
        ? ` [repos: ${configRepos.join(', ')}]`
        : '';
      console.log(`[Worker] Registered: ${worker.name} (${worker.id})${repoInfo}`);
    } catch (error) {
      console.error('[Worker] Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  }

  private async handleWorkerHeartbeat(
    socket: WorkerSocket,
    data: WorkerHeartbeatEvent
  ): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) return;

    try {
      worker.lastHeartbeat = new Date();

      await prisma.worker.update({
        where: { id: worker.workerId },
        data: {
          status: data.status,
          lastSeen: new Date(),
        },
      });
    } catch (error) {
      console.error('[Worker] Heartbeat error:', error);
    }
  }

  private async handleTaskStarted(
    socket: WorkerSocket,
    data: TaskStartedEvent
  ): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) return;

    try {
      const task = await prisma.task.update({
        where: { id: data.taskId },
        data: {
          status: 'RUNNING',
          workerId: worker.workerId,
          startedAt: new Date(),
        },
      });

      // Broadcast to task subscribers
      this.io.to(`task:${data.taskId}`).emit('task:updated', task);

      console.log(`[Task] Started: ${data.taskId} on ${worker.name}`);
    } catch (error) {
      console.error('[Task] Start error:', error);
    }
  }

  private async handleTaskLog(
    socket: WorkerSocket,
    data: TaskLogEvent
  ): Promise<void> {
    try {
      const log = await prisma.taskLog.create({
        data: {
          taskId: data.taskId,
          type: data.type as any,
          content: data.content as any,
          timestamp: new Date(data.timestamp),
        },
      });

      // Broadcast log to task subscribers
      this.io.to(`task:${data.taskId}`).emit('task:log', log);
    } catch (error) {
      console.error('[Task] Log error:', error);
    }
  }

  private async handleTaskCompleted(
    socket: WorkerSocket,
    data: TaskCompletedEvent
  ): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) return;

    try {
      const task = await prisma.task.update({
        where: { id: data.taskId },
        data: {
          status: 'COMPLETED',
          result: data.result,
          duration: data.duration,
          completedAt: new Date(),
          sessionId: data.sessionId,  // Store session ID for future resume
        },
      });

      // Update worker status
      await prisma.worker.update({
        where: { id: worker.workerId },
        data: { status: 'ONLINE' },
      });

      // Broadcast updates
      this.io.to(`task:${data.taskId}`).emit('task:updated', task);
      this.io.emit('worker:updated', { id: worker.workerId, status: 'ONLINE' });

      // Handle PR review completion if this is a PR_REVIEW task
      if (task.taskType === 'PR_REVIEW') {
        try {
          const result = await handlePRReviewCompleted(data.taskId, data.result);
          if (result.success) {
            console.log(`[Task] PR review posted: ${result.commentUrl}`);
          } else {
            console.error(`[Task] PR review post failed: ${result.error}`);
          }
        } catch (error) {
          console.error('[Task] PR review handling error:', error);
        }
      }

      console.log(`[Task] Completed: ${data.taskId} (${data.duration}ms, session: ${data.sessionId || 'none'})`);
    } catch (error) {
      console.error('[Task] Complete error:', error);
    }
  }

  private async handleTaskFailed(
    socket: WorkerSocket,
    data: TaskFailedEvent
  ): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) return;

    try {
      const task = await prisma.task.update({
        where: { id: data.taskId },
        data: {
          status: 'FAILED',
          errorMessage: data.error,
          completedAt: new Date(),
        },
      });

      // Update worker status
      await prisma.worker.update({
        where: { id: worker.workerId },
        data: { status: 'ONLINE' },
      });

      // Broadcast updates
      this.io.to(`task:${data.taskId}`).emit('task:updated', task);
      this.io.emit('worker:updated', { id: worker.workerId, status: 'ONLINE' });

      // Handle PR review failure if this is a PR_REVIEW task
      if (task.taskType === 'PR_REVIEW') {
        try {
          await handlePRReviewFailed(data.taskId, data.error);
        } catch (error) {
          console.error('[Task] PR review failure handling error:', error);
        }
      }

      console.log(`[Task] Failed: ${data.taskId} - ${data.error}`);
    } catch (error) {
      console.error('[Task] Fail error:', error);
    }
  }

  private async handleOrchestrationDecision(
    socket: WorkerSocket,
    data: OrchestrationDecisionEvent
  ): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) {
      console.error('[Orchestration] Decision from unknown socket');
      return;
    }

    try {
      // Verify this is from an orchestrator
      const orchestrator = await prisma.worker.findUnique({
        where: { id: worker.workerId },
      });

      if (!orchestrator?.isOrchestrator) {
        console.error(`[Orchestration] Decision from non-orchestrator worker ${worker.name}`);
        return;
      }

      // Update worker status back to ONLINE (orchestration analysis done)
      await prisma.worker.update({
        where: { id: worker.workerId },
        data: { status: 'ONLINE' },
      });

      // Delegate to orchestration handler
      const handler = getOrchestrationHandler();
      await handler.handleDecision(data);

      console.log(`[Orchestration] Processed decision from ${worker.name} for task ${data.taskId}`);
    } catch (error) {
      console.error('[Orchestration] Decision handling error:', error);
    }
  }

  private async handleDisconnect(socket: WorkerSocket): Promise<void> {
    const worker = this.workers.get(socket.id);
    if (!worker) return;

    try {
      // Update worker status to offline
      const updatedWorker = await prisma.worker.update({
        where: { id: worker.workerId },
        data: { status: 'OFFLINE' },
      });

      // Broadcast worker update
      this.io.emit('worker:updated', updatedWorker);

      // Clean up
      this.workers.delete(socket.id);
      this.workerIdToSocket.delete(worker.workerId);

      console.log(`[Worker] Disconnected: ${worker.name}`);
    } catch (error) {
      console.error('[Worker] Disconnect error:', error);
    }
  }

  // Assign task to a specific worker
  async assignTask(
    workerId: string,
    taskId: string,
    prompt: string,
    sessionId?: string,      // Session ID to resume (for follow-ups)
    parentTaskId?: string,   // Parent task reference
    taskType?: TaskType,     // Task type for orchestration
    orchestrationDepth?: number  // Current orchestration depth
  ): Promise<boolean> {
    const socketId = this.workerIdToSocket.get(workerId);
    if (!socketId) return false;

    const worker = this.workers.get(socketId);
    if (!worker) return false;

    // If assigning to orchestrator, include available workers info
    let availableWorkers: WorkerRoutingInfo[] | undefined = undefined;
    const dbWorker = await prisma.worker.findUnique({ where: { id: workerId } });

    if (dbWorker?.isOrchestrator && taskType === 'REGULAR') {
      // Get available workers for orchestrator to route to
      const workers = await prisma.worker.findMany({
        where: { status: 'ONLINE', isOrchestrator: false },
        select: {
          id: true,
          name: true,
          status: true,
          os: true,
          hostname: true,
          lastSeen: true,
        },
      });
      availableWorkers = workers.map((w): WorkerRoutingInfo => ({
        id: w.id,
        name: w.name,
        status: w.status,
        os: w.os,
        hostname: w.hostname,
        lastSeen: w.lastSeen || new Date(),
      }));
    }

    worker.socket.emit('task:assign', {
      taskId,
      prompt,
      sessionId,
      parentTaskId,
      taskType,
      availableWorkers,
      orchestrationDepth,
    });

    if (sessionId) {
      console.log(`[Task] Assigned follow-up: ${taskId} (session: ${sessionId}, parent: ${parentTaskId})`);
    }

    return true;
  }

  // Cancel task on a worker
  async cancelTask(workerId: string, taskId: string): Promise<boolean> {
    const socketId = this.workerIdToSocket.get(workerId);
    if (!socketId) return false;

    const worker = this.workers.get(socketId);
    if (!worker) return false;

    worker.socket.emit('task:cancel', { taskId });
    return true;
  }

  // Get list of online workers
  getOnlineWorkers(): string[] {
    return Array.from(this.workerIdToSocket.keys());
  }

  // Get connected worker count
  getConnectedCount(): number {
    return this.workers.size;
  }

  // Start heartbeat monitor to detect stale workers
  private startHeartbeatMonitor(): void {
    this.heartbeatCheckInterval = setInterval(async () => {
      const now = Date.now();
      const staleWorkers: Array<{ socketId: string; worker: ConnectedWorker }> = [];

      // Find workers with stale heartbeats
      this.workers.forEach((worker, socketId) => {
        const timeSinceHeartbeat = now - worker.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
          staleWorkers.push({ socketId, worker });
        }
      });

      // Handle stale workers
      for (const { socketId, worker } of staleWorkers) {
        console.log(`[Worker] Heartbeat timeout: ${worker.name} (last heartbeat ${Math.round((now - worker.lastHeartbeat.getTime()) / 1000)}s ago)`);

        try {
          // Update database
          const updatedWorker = await prisma.worker.update({
            where: { id: worker.workerId },
            data: { status: 'OFFLINE' },
          });

          // Broadcast worker update
          this.io.emit('worker:updated', updatedWorker);

          // Force disconnect the socket
          worker.socket.disconnect(true);

          // Clean up maps
          this.workers.delete(socketId);
          this.workerIdToSocket.delete(worker.workerId);
        } catch (error) {
          console.error(`[Worker] Failed to mark ${worker.name} as offline:`, error);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    console.log('[WorkerManager] Heartbeat monitor started');
  }

  // Clean up workers that were left ONLINE from previous server runs
  private async cleanupStaleWorkersOnStartup(): Promise<void> {
    try {
      const result = await prisma.worker.updateMany({
        where: { status: { in: ['ONLINE', 'BUSY'] } },
        data: { status: 'OFFLINE' },
      });

      if (result.count > 0) {
        console.log(`[WorkerManager] Cleaned up ${result.count} stale worker(s) on startup`);
      }
    } catch (error) {
      console.error('[WorkerManager] Failed to cleanup stale workers:', error);
    }
  }

  // Stop heartbeat monitor (for cleanup)
  stopHeartbeatMonitor(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
      console.log('[WorkerManager] Heartbeat monitor stopped');
    }
  }

  /**
   * Sync worker's GitHub repository assignments
   * Creates WorkerRepository records for repos that exist in DB
   */
  private async syncWorkerRepoAssignments(
    workerId: string,
    repoFullNames: string[]
  ): Promise<void> {
    for (const fullName of repoFullNames) {
      try {
        // Find repo by fullName (e.g., "owner/repo")
        const repo = await prisma.gitHubRepository.findFirst({
          where: { fullName },
        });

        if (!repo) {
          console.log(`[Worker] Repo ${fullName} not found in DB, skipping assignment`);
          continue;
        }

        // Create or update assignment
        await prisma.workerRepository.upsert({
          where: {
            workerId_repositoryId: {
              workerId,
              repositoryId: repo.id,
            },
          },
          create: {
            workerId,
            repositoryId: repo.id,
          },
          update: {
            // Just touch the record to confirm it still exists
          },
        });

        console.log(`[Worker] Assigned to repo: ${fullName}`);
      } catch (error) {
        console.error(`[Worker] Failed to assign repo ${fullName}:`, error);
      }
    }
  }
}

// Singleton instance
let workerManager: WorkerManager | null = null;

export function initWorkerManager(io: SocketIOServer): WorkerManager {
  if (!workerManager) {
    workerManager = new WorkerManager(io);
  }
  return workerManager;
}

export function getWorkerManager(): WorkerManager | null {
  return workerManager;
}
