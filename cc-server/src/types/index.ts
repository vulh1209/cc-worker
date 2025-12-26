// Shared types between server and client

export type WorkerStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type LogType = 'SYSTEM' | 'TEXT' | 'THINKING' | 'TOOL_USE' | 'TOOL_RESULT' | 'ERROR';

export interface WorkerInfo {
  id: string;
  name: string;
  apiKey: string;
  os: string | null;
  hostname: string | null;
  ipAddress: string | null;
  status: WorkerStatus;
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  workerId: string | null;
  result: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: LogType;
  content: unknown;
  timestamp: Date;
}

// WebSocket events: Server → Worker
export interface TaskAssignEvent {
  taskId: string;
  prompt: string;
}

export interface TaskCancelEvent {
  taskId: string;
}

// WebSocket events: Worker → Server
export interface WorkerRegisterEvent {
  apiKey: string;
  name: string;
  os: string;
  hostname: string;
}

export interface WorkerHeartbeatEvent {
  timestamp: string;
  status: WorkerStatus;
}

export interface TaskStartedEvent {
  taskId: string;
}

export interface TaskLogEvent {
  taskId: string;
  type: LogType;
  content: unknown;
  timestamp: string;
}

export interface TaskCompletedEvent {
  taskId: string;
  result: string;
  duration: number;
}

export interface TaskFailedEvent {
  taskId: string;
  error: string;
}

// Socket.io event maps
export interface ServerToWorkerEvents {
  'task:assign': (data: TaskAssignEvent) => void;
  'task:cancel': (data: TaskCancelEvent) => void;
  'ping': (data: { timestamp: string }) => void;
  'error': (data: { message: string }) => void;
}

export interface WorkerToServerEvents {
  'worker:register': (data: WorkerRegisterEvent) => void;
  'worker:heartbeat': (data: WorkerHeartbeatEvent) => void;
  'task:started': (data: TaskStartedEvent) => void;
  'task:log': (data: TaskLogEvent) => void;
  'task:completed': (data: TaskCompletedEvent) => void;
  'task:failed': (data: TaskFailedEvent) => void;
}

// Dashboard real-time events (Server → Browser)
export interface ServerToBrowserEvents {
  'worker:updated': (data: WorkerInfo) => void;
  'task:updated': (data: Task) => void;
  'task:log': (data: TaskLog) => void;
}

export interface BrowserToServerEvents {
  'subscribe:worker': (workerId: string) => void;
  'subscribe:task': (taskId: string) => void;
  'unsubscribe:worker': (workerId: string) => void;
  'unsubscribe:task': (taskId: string) => void;
}
