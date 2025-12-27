// Shared types between server and client

export type WorkerStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
export type TaskStatus = 'PENDING' | 'ORCHESTRATING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskType = 'REGULAR' | 'ORCHESTRATION_ANALYSIS' | 'SUBTASK' | 'PR_REVIEW';
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
  // Orchestration fields
  isOrchestrator: boolean;
  orchestratorConfig: OrchestratorConfig | null;
}

export interface OrchestratorConfig {
  fallbackMode?: 'queue' | 'fallback' | 'hybrid';
  maxDepth?: number;
  timeoutMs?: number;
}

export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  priority: number;
  workerId: string | null;
  result: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  // Session continuity
  sessionId: string | null;
  parentTaskId: string | null;
  // Orchestration fields
  taskType: TaskType;
  orchestratedByTaskId: string | null;
  orchestrationDepth: number;
  routingDecision: OrchestrationDecision | null;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: LogType;
  content: unknown;
  timestamp: Date;
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

// Lightweight worker info for orchestration routing
export interface WorkerRoutingInfo {
  id: string;
  name: string;
  status: WorkerStatus;
  os: string | null;
  hostname: string | null;
  lastSeen: Date;
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
  // PR Review fields
  prReviewContext?: PRReviewContext;
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
  'orchestration:decision': (data: OrchestrationDecisionEvent) => void;
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

// ============================================================================
// PR Review Types
// ============================================================================

export interface PRReviewContext {
  repository: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  pullRequest: {
    number: number;
    title: string;
    description: string | null;
    author: string;
    baseBranch: string;
    headBranch: string;
    url: string;
    headSha: string;
  };
  files: PRFileChange[];
  diff: string;
  installationId: number;
  reviewGuidelines?: string;
}

export interface PRFileChange {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRReviewResult {
  summary: string;
  overallAssessment: 'approve' | 'request_changes' | 'comment';
  overallComment: string;
  riskLevel: 'low' | 'medium' | 'high';
  categories: {
    security: PRCategoryScore;
    performance: PRCategoryScore;
    codeQuality: PRCategoryScore;
    testCoverage: PRCategoryScore;
  };
  comments: PRLineComment[];
  suggestions: string[];
}

export interface PRCategoryScore {
  score: number;  // 1-5
  issues: string[];
}

export interface PRLineComment {
  file: string;
  line: number;
  side: 'LEFT' | 'RIGHT';  // LEFT for deletions, RIGHT for additions
  body: string;
  severity: 'suggestion' | 'warning' | 'blocker';
}
