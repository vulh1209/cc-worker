import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import type { WorkerConfig } from '../config.js';
import type {
  ServerToWorkerEvents,
  WorkerToServerEvents,
  TaskAssignEvent,
  TaskCancelEvent,
  TaskLogEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskStartedEvent,
  WorkerStatus,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getSystemInfo } from '../utils/system-info.js';

// Type-safe socket with custom events
type TypedSocket = Socket<ServerToWorkerEvents, WorkerToServerEvents>;

export interface WebSocketClientEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  reconnecting: (attempt: number) => void;
  taskAssigned: (data: TaskAssignEvent) => void;
  taskCancelled: (data: TaskCancelEvent) => void;
  error: (error: Error) => void;
}

export class WebSocketClient extends EventEmitter {
  private socket: TypedSocket | null = null;
  private config: WorkerConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: WorkerConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to server: ${this.config.serverUrl}`);

      this.socket = io(this.config.serverUrl, {
        path: '/api/ws',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: this.config.reconnectInterval,
        reconnectionDelayMax: 30000,
        timeout: 20000,
        auth: {
          apiKey: this.config.apiKey,
        },
      }) as TypedSocket;

      // Connection handlers
      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.connection('connected');

        // Register worker with server
        this.registerWorker();

        // Start heartbeat
        this.startHeartbeat();

        this.emit('connected');
        resolve();
      });

      this.socket.on('disconnect', (reason: string) => {
        this.isConnected = false;
        logger.connection('disconnected');
        this.stopHeartbeat();
        this.emit('disconnected', reason);
      });

      this.socket.io.on('reconnect_attempt', (attempt: number) => {
        this.reconnectAttempts = attempt;
        logger.connection('reconnecting');
        this.emit('reconnecting', attempt);
      });

      this.socket.io.on('reconnect', () => {
        logger.info('Reconnected successfully');
        this.registerWorker();
        this.startHeartbeat();
      });

      this.socket.on('connect_error', (error: Error) => {
        logger.error('Connection error:', error.message);
        if (this.reconnectAttempts === 0) {
          // First connection attempt failed
          reject(error);
        }
        this.emit('error', error);
      });

      // Task event handlers
      this.socket.on('task:assign', (data: TaskAssignEvent) => {
        logger.info(`Received task: ${data.taskId}`);
        this.emit('taskAssigned', data);
      });

      this.socket.on('task:cancel', (data: TaskCancelEvent) => {
        logger.info(`Task cancelled: ${data.taskId}`);
        this.emit('taskCancelled', data);
      });

      this.socket.on('ping', (data: { timestamp: string }) => {
        logger.debug('Received ping:', data.timestamp);
      });

      this.socket.on('error', (data: { message: string }) => {
        logger.error('Server error:', data.message);
        this.emit('error', new Error(data.message));
      });

      // Set a connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 30000);
    });
  }

  private registerWorker(): void {
    if (!this.socket) return;

    const systemInfo = getSystemInfo();
    this.socket.emit('worker:register', {
      apiKey: this.config.apiKey,
      name: this.config.workerName,
      os: systemInfo.os,
      hostname: systemInfo.hostname,
    });

    logger.info(`Registered as "${this.config.workerName}"`);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('worker:heartbeat', {
          timestamp: new Date().toISOString(),
          status: 'ONLINE' as WorkerStatus,
        });
        logger.debug('Sent heartbeat');
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Task event emitters
  sendTaskStarted(data: TaskStartedEvent): void {
    this.socket?.emit('task:started', data);
  }

  sendTaskLog(data: TaskLogEvent): void {
    this.socket?.emit('task:log', data);
  }

  sendTaskCompleted(data: TaskCompletedEvent): void {
    this.socket?.emit('task:completed', data);
  }

  sendTaskFailed(data: TaskFailedEvent): void {
    this.socket?.emit('task:failed', data);
  }

  updateStatus(status: WorkerStatus): void {
    this.socket?.emit('worker:heartbeat', {
      timestamp: new Date().toISOString(),
      status,
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.isConnected = false;
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
