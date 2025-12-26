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
} from '@/types';
import prisma from './prisma';

type WorkerSocket = Socket<WorkerToServerEvents, ServerToWorkerEvents>;
type BrowserSocket = Socket<BrowserToServerEvents, ServerToBrowserEvents>;

interface ConnectedWorker {
  socket: WorkerSocket;
  workerId: string;
  name: string;
  lastHeartbeat: Date;
}

export class WorkerManager {
  private io: SocketIOServer;
  private workers: Map<string, ConnectedWorker> = new Map(); // socketId -> worker
  private workerIdToSocket: Map<string, string> = new Map(); // workerId -> socketId

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
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

      // Update worker info
      const updatedWorker = await prisma.worker.update({
        where: { id: worker.id },
        data: {
          status: 'ONLINE',
          os: data.os,
          hostname: data.hostname,
          lastSeen: new Date(),
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

      console.log(`[Worker] Registered: ${worker.name} (${worker.id})`);
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

      console.log(`[Task] Failed: ${data.taskId} - ${data.error}`);
    } catch (error) {
      console.error('[Task] Fail error:', error);
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
    parentTaskId?: string    // Parent task reference
  ): Promise<boolean> {
    const socketId = this.workerIdToSocket.get(workerId);
    if (!socketId) return false;

    const worker = this.workers.get(socketId);
    if (!worker) return false;

    worker.socket.emit('task:assign', { taskId, prompt, sessionId, parentTaskId });

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
