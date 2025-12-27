// Shared types between worker and server

export type WorkerStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
export type TaskStatus = 'PENDING' | 'ORCHESTRATING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskType = 'REGULAR' | 'ORCHESTRATION_ANALYSIS' | 'SUBTASK';
export type LogType = 'SYSTEM' | 'TEXT' | 'THINKING' | 'TOOL_USE' | 'TOOL_RESULT' | 'ERROR';

export interface WorkerInfo {
  id: string;
  name: string;
  os: string;
  hostname: string;
  status: WorkerStatus;
  lastSeen: Date;
  isOrchestrator?: boolean;
}

// Lightweight worker info for orchestration routing
export interface WorkerRoutingInfo {
  id: string;
  name: string;
  status: WorkerStatus;
  os: string | null;
  hostname: string | null;
  lastSeen: Date;
}

export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  workerId?: string;
  result?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
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
  sessionId?: string;      // Session ID to resume (for follow-ups)
  parentTaskId?: string;   // Parent task reference
  // Orchestration fields
  taskType?: TaskType;
  availableWorkers?: WorkerRoutingInfo[];  // For orchestrator routing decisions
  orchestrationDepth?: number;
}

export interface TaskCancelEvent {
  taskId: string;
}

export interface PingEvent {
  timestamp: string;
}

// WebSocket events: Worker → Server
export interface WorkerRegisterEvent {
  apiKey: string;
  name: string;
  os: string;
  hostname: string;
  isOrchestrator?: boolean;  // Worker can self-register as orchestrator
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
  sessionId?: string;      // Session ID for future resume
}

export interface TaskFailedEvent {
  taskId: string;
  error: string;
}

// Socket.io event maps for type safety
export interface ServerToWorkerEvents {
  'task:assign': (data: TaskAssignEvent) => void;
  'task:cancel': (data: TaskCancelEvent) => void;
  'ping': (data: PingEvent) => void;
  'error': (data: { message: string }) => void;
}

export interface WorkerToServerEvents {
  'worker:register': (data: WorkerRegisterEvent) => void;
  'worker:heartbeat': (data: WorkerHeartbeatEvent) => void;
  'task:started': (data: TaskStartedEvent) => void;
  'task:log': (data: TaskLogEvent) => void;
  'task:completed': (data: TaskCompletedEvent) => void;
  'task:failed': (data: TaskFailedEvent) => void;
  'orchestration:decision': (data: OrchestrationDecisionEvent) => void;
}

// Orchestration types
export interface OrchestrationDecision {
  action: 'route' | 'adjust_priority' | 'decompose';
  targetWorkerId?: string;
  newPriority?: number;
  subtasks?: SubtaskDefinition[];
  reasoning: string;
}

export interface SubtaskDefinition {
  prompt: string;
  priority: number;
  preferredWorkerId?: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface OrchestrationDecisionEvent {
  taskId: string;
  decision: OrchestrationDecision;
}
