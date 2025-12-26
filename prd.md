# CC-Worker: Distributed Claude Code Worker System
## Product Requirements Document (PRD)

**Version:** 1.0
**Date:** 2025-12-26
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement
Hiện tại, Claude Code chỉ có thể chạy trực tiếp trên máy local. Không có cách nào để:
- Điều khiển Claude Code từ xa
- Quản lý nhiều Claude Code instances trên nhiều máy
- Theo dõi và giám sát tasks đang chạy
- Phân phối công việc đến các máy khác nhau

### 1.2 Solution
**CC-Worker** là hệ thống phân tán bao gồm:
- **Worker Bot**: Ứng dụng terminal chạy trên Mac/Windows/Linux, kết nối đến server trung tâm
- **Central Server**: Dashboard web để quản lý workers, gửi tasks, theo dõi tiến độ real-time

### 1.3 Target Users
- DevOps teams cần chạy Claude Code trên nhiều servers
- Developers muốn điều khiển Claude Code từ xa
- Teams cần giám sát và quản lý Claude Code tasks

---

## 2. Goals & Success Metrics

### 2.1 Goals
| Priority | Goal |
|----------|------|
| P0 | Worker bot có thể nhận và thực thi tasks từ server |
| P0 | Dashboard hiển thị workers online/offline |
| P0 | Streaming logs real-time khi task đang chạy |
| P1 | Xem lại history của tasks đã hoàn thành |
| P1 | Build standalone binary cho 3 platforms |
| P2 | Auto-reconnect khi mất kết nối |

### 2.2 Success Metrics
- Worker uptime > 99%
- Task success rate > 95%
- Log streaming latency < 100ms
- Dashboard page load < 2s

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CENTRAL SERVER                              │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │                 │  │                 │  │                 │  │
│  │   Next.js App   │──│  WebSocket      │──│   PostgreSQL    │  │
│  │   (Dashboard)   │  │  Server         │  │   Database      │  │
│  │                 │  │  (Socket.io)    │  │                 │  │
│  └─────────────────┘  └────────┬────────┘  └─────────────────┘  │
│                                │                                  │
└────────────────────────────────┼──────────────────────────────────┘
                                 │
                                 │ WebSocket (wss://)
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
  │                 │    │                 │    │                 │
  │  Worker Bot     │    │  Worker Bot     │    │  Worker Bot     │
  │  (MacOS)        │    │  (Windows)      │    │  (Linux)        │
  │                 │    │                 │    │                 │
  │  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
  │  │ Claude    │  │    │  │ Claude    │  │    │  │ Claude    │  │
  │  │ Agent SDK │  │    │  │ Agent SDK │  │    │  │ Agent SDK │  │
  │  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │
  │                 │    │                 │    │                 │
  └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Worker Bot** | TypeScript + Node.js | Claude Agent SDK official support |
| **Claude Integration** | @anthropic-ai/claude-agent-sdk | Official SDK với full capabilities |
| **Build Tool** | pkg | Build Node.js → standalone binary |
| **Server Framework** | Next.js 14 (App Router) | Full-stack, modern React |
| **WebSocket** | Socket.io | Reliable, auto-reconnect, rooms |
| **Database** | PostgreSQL + Prisma | Reliable, strong typing |
| **UI Components** | shadcn/ui + Tailwind CSS | Modern, customizable |
| **Authentication** | API Key per worker | Simple, secure enough for v1 |

---

## 4. Detailed Requirements

### 4.1 Worker Bot (cc-worker)

#### 4.1.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| W-01 | Connect to server via WebSocket | P0 |
| W-02 | Authenticate with API key | P0 |
| W-03 | Send system info on connect (OS, hostname) | P0 |
| W-04 | Receive and execute task (Claude prompt) | P0 |
| W-05 | Stream Claude output back to server | P0 |
| W-06 | Handle task cancellation | P1 |
| W-07 | Auto-reconnect on disconnect | P1 |
| W-08 | Heartbeat every 30 seconds | P1 |
| W-09 | Read config from file | P0 |
| W-10 | CLI interface for setup/status | P2 |

#### 4.1.2 Configuration Schema

```json
{
  "serverUrl": "wss://cc-server.example.com",
  "apiKey": "worker_xxxxxxxx",
  "workerName": "my-macbook-pro",
  "workingDirectory": "/Users/dev/projects",
  "claudeApiKey": "sk-ant-xxxxxxxx",
  "maxConcurrentTasks": 1,
  "reconnectInterval": 5000,
  "heartbeatInterval": 30000
}
```

#### 4.1.3 Claude Agent SDK Integration

```typescript
// Core execution flow
import { query } from "@anthropic-ai/claude-agent-sdk";

async function executeTask(prompt: string) {
  for await (const message of query({
    prompt: prompt,
    options: {
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      permissionMode: "acceptEdits",
      cwd: config.workingDirectory
    }
  })) {
    // Stream each message back to server
    if (message.type === "assistant") {
      streamToServer("task:log", { type: "assistant", content: message });
    }
    if (message.type === "result") {
      streamToServer("task:completed", { result: message });
    }
  }
}
```

#### 4.1.4 Build Targets

| Platform | Binary Name | Architecture |
|----------|-------------|--------------|
| macOS | cc-worker-macos | x64, arm64 (Universal) |
| Windows | cc-worker-win.exe | x64 |
| Linux | cc-worker-linux | x64 |

---

### 4.2 Central Server (cc-server)

#### 4.2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| S-01 | WebSocket server for worker connections | P0 |
| S-02 | Worker registration and status tracking | P0 |
| S-03 | Store workers/tasks in PostgreSQL | P0 |
| S-04 | API endpoints for CRUD operations | P0 |
| S-05 | Dashboard: Workers list page | P0 |
| S-06 | Dashboard: Tasks list page | P0 |
| S-07 | Dashboard: Create new task | P0 |
| S-08 | Dashboard: Live log streaming | P0 |
| S-09 | Dashboard: Task history view | P1 |
| S-10 | API key generation for workers | P1 |

#### 4.2.2 Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Worker {
  id          String       @id @default(cuid())
  name        String
  apiKey      String       @unique
  status      WorkerStatus @default(OFFLINE)
  os          String?
  hostname    String?
  ipAddress   String?
  lastSeen    DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  tasks       Task[]
}

model Task {
  id          String     @id @default(cuid())
  prompt      String     @db.Text
  status      TaskStatus @default(PENDING)
  workerId    String?
  worker      Worker?    @relation(fields: [workerId], references: [id])
  result      String?    @db.Text
  errorMessage String?
  logs        TaskLog[]
  startedAt   DateTime?
  completedAt DateTime?
  duration    Int?       // milliseconds
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model TaskLog {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  type      LogType
  content   Json
  timestamp DateTime @default(now())

  @@index([taskId, timestamp])
}

enum WorkerStatus {
  ONLINE
  OFFLINE
  BUSY
}

enum TaskStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum LogType {
  SYSTEM
  TEXT
  THINKING
  TOOL_USE
  TOOL_RESULT
  ERROR
}
```

#### 4.2.3 WebSocket Protocol

**Events from Server to Worker:**

| Event | Payload | Description |
|-------|---------|-------------|
| `task:assign` | `{ taskId, prompt }` | Assign new task to worker |
| `task:cancel` | `{ taskId }` | Cancel running task |
| `ping` | `{ timestamp }` | Keep-alive ping |

**Events from Worker to Server:**

| Event | Payload | Description |
|-------|---------|-------------|
| `worker:register` | `{ apiKey, name, os, hostname }` | Register on connect |
| `worker:heartbeat` | `{ timestamp, status }` | Heartbeat response |
| `task:started` | `{ taskId }` | Task execution started |
| `task:log` | `{ taskId, type, content, timestamp }` | Log entry |
| `task:completed` | `{ taskId, result, duration }` | Task completed |
| `task:failed` | `{ taskId, error }` | Task failed |

#### 4.2.4 API Endpoints

```
# Workers
GET    /api/workers              # List all workers
POST   /api/workers              # Create new worker (generate API key)
GET    /api/workers/:id          # Get worker details
DELETE /api/workers/:id          # Delete worker

# Tasks
GET    /api/tasks                # List tasks (with filters)
POST   /api/tasks                # Create new task
GET    /api/tasks/:id            # Get task details
POST   /api/tasks/:id/cancel     # Cancel task
GET    /api/tasks/:id/logs       # Get task logs

# WebSocket
GET    /api/ws                   # WebSocket upgrade endpoint
```

---

### 4.3 Dashboard UI

#### 4.3.1 Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Overview dashboard |
| Workers | `/workers` | List all workers |
| Worker Detail | `/workers/[id]` | Worker info + tasks |
| Tasks | `/tasks` | List all tasks |
| New Task | `/tasks/new` | Create task form |
| Task Detail | `/tasks/[id]` | Task detail + live logs |

#### 4.3.2 Workers Page Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Workers                                    [+ Add Worker]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │ 🟢 worker-macbook        │  │ 🔴 worker-linux-1        │ │
│  │ macOS • 192.168.1.10     │  │ Linux • 192.168.1.20     │ │
│  │ Last seen: Just now      │  │ Last seen: 5 min ago     │ │
│  │ Status: IDLE             │  │ Status: OFFLINE          │ │
│  │                          │  │                          │ │
│  │ [View Tasks] [Send Task] │  │ [View Tasks]             │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.3.3 Task Detail + Live Logs Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Task: abc123                              [Cancel] [Back]  │
│  Status: 🟡 RUNNING                                         │
│  Worker: worker-macbook                                     │
│  Started: 2 minutes ago                                     │
├─────────────────────────────────────────────────────────────┤
│  Prompt:                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Review the code in src/api and fix any security issues ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Live Logs:                                     [Auto-scroll]│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [10:30:01] 🔧 Tool: Read file src/api/auth.ts          ││
│  │ [10:30:02] 💭 Analyzing authentication logic...         ││
│  │ [10:30:05] 🔧 Tool: Edit file src/api/auth.ts          ││
│  │ [10:30:06] 💭 Fixed SQL injection vulnerability         ││
│  │ [10:30:08] 🔧 Tool: Read file src/api/users.ts         ││
│  │ █                                                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Project Structure

### 5.1 Worker Bot (cc-worker)

```
cc-worker/
├── src/
│   ├── index.ts                 # Entry point + CLI
│   ├── config.ts                # Config loader
│   ├── worker/
│   │   ├── WorkerClient.ts      # Main orchestrator
│   │   ├── WebSocketClient.ts   # Socket.io client
│   │   └── TaskExecutor.ts      # Claude SDK integration
│   ├── types/
│   │   └── index.ts             # Type definitions
│   └── utils/
│       ├── logger.ts            # Logging utility
│       └── system-info.ts       # OS/hardware info
├── package.json
├── tsconfig.json
├── .env.example
└── build.config.js              # pkg configuration
```

### 5.2 Central Server (cc-server)

```
cc-server/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                     # Home dashboard
│   │   ├── workers/
│   │   │   ├── page.tsx                 # Workers list
│   │   │   └── [id]/page.tsx            # Worker detail
│   │   ├── tasks/
│   │   │   ├── page.tsx                 # Tasks list
│   │   │   ├── new/page.tsx             # Create task
│   │   │   └── [id]/page.tsx            # Task detail + live logs
│   │   └── api/
│   │       ├── workers/
│   │       │   ├── route.ts             # GET, POST
│   │       │   └── [id]/route.ts        # GET, DELETE
│   │       ├── tasks/
│   │       │   ├── route.ts             # GET, POST
│   │       │   └── [id]/
│   │       │       ├── route.ts         # GET
│   │       │       ├── cancel/route.ts  # POST
│   │       │       └── logs/route.ts    # GET
│   │       └── ws/route.ts              # WebSocket upgrade
│   ├── components/
│   │   ├── ui/                          # shadcn components
│   │   ├── WorkerCard.tsx
│   │   ├── WorkerList.tsx
│   │   ├── TaskList.tsx
│   │   ├── TaskForm.tsx
│   │   ├── LiveLogViewer.tsx
│   │   └── TerminalOutput.tsx
│   ├── lib/
│   │   ├── prisma.ts                    # Prisma client
│   │   ├── websocket-server.ts          # Socket.io server
│   │   ├── worker-manager.ts            # Worker state management
│   │   └── utils.ts                     # Utilities
│   └── types/
│       └── index.ts                     # Shared types
├── prisma/
│   └── schema.prisma
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.example
```

---

## 6. Implementation Phases

### Phase 1: Foundation (MVP)
**Goal:** Basic working system với core features

| Task | Component | Estimate |
|------|-----------|----------|
| Setup cc-worker project | Worker | - |
| Implement WebSocketClient | Worker | - |
| Implement TaskExecutor (Claude SDK) | Worker | - |
| Setup cc-server Next.js project | Server | - |
| Setup Prisma + PostgreSQL | Server | - |
| Implement WebSocket server | Server | - |
| Workers list page | Dashboard | - |
| Tasks list page | Dashboard | - |
| Create task page | Dashboard | - |
| Task detail + live logs | Dashboard | - |

**Deliverables:**
- Worker có thể connect và nhận tasks
- Dashboard có thể quản lý workers và tasks
- Live log streaming hoạt động

### Phase 2: Polish
**Goal:** Production-ready quality

| Task | Component |
|------|-----------|
| Auto-reconnect logic | Worker |
| Heartbeat mechanism | Both |
| Task cancellation | Both |
| Error handling | Both |
| Build standalone binaries | Worker |
| Task history view | Dashboard |
| Worker detail page | Dashboard |
| API key generation UI | Dashboard |

### Phase 3: Enhancements
**Goal:** Advanced features

| Task | Component |
|------|-----------|
| Auto-update mechanism | Worker |
| Task templates | Dashboard |
| Multi-task queue | Both |
| Metrics/analytics | Dashboard |
| User authentication | Server |
| Role-based access | Server |

---

## 7. Security Considerations

### 7.1 Authentication
- Each worker has unique API key
- API keys stored hashed in database
- Keys generated with sufficient entropy (256-bit)

### 7.2 Transport Security
- All WebSocket connections over TLS (wss://)
- API endpoints over HTTPS

### 7.3 Worker Isolation
- Each worker runs with configured working directory
- Claude Agent SDK sandboxing enabled
- No cross-worker access

### 7.4 Sensitive Data
- Claude API key stored only on worker
- No sensitive prompts/outputs logged permanently (configurable)
- Option to auto-delete task logs after X days

---

## 8. Deployment

### 8.1 Server Deployment
- **Platform:** Vercel / Railway / Self-hosted
- **Database:** Managed PostgreSQL (Supabase, Neon, etc.)
- **Domain:** Custom domain with SSL

### 8.2 Worker Deployment
1. Download binary for platform
2. Create config file `~/.cc-worker/config.json`
3. Run binary: `./cc-worker`
4. (Optional) Setup as system service for auto-start

### 8.3 Worker Install Script (Future)

```bash
# macOS/Linux
curl -sSL https://cc-worker.example.com/install.sh | bash

# Windows (PowerShell)
irm https://cc-worker.example.com/install.ps1 | iex
```

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude API rate limits | High | Queue tasks, retry logic |
| WebSocket disconnections | Medium | Auto-reconnect, offline buffer |
| Large task outputs | Medium | Streaming, pagination |
| Worker crashes | Medium | Process monitoring, auto-restart |
| Database performance | Low | Indexes, log retention policy |

---

## 10. Open Questions

1. **Task Priority:** Có cần support task priority không?
2. **Worker Groups:** Có cần phân nhóm workers không (dev/staging/prod)?
3. **Notifications:** Có cần notify khi task done (Slack/Discord/Email)?
4. **Rate Limiting:** Có giới hạn số tasks/worker/day không?
5. **Audit Logs:** Có cần log ai tạo task, ai cancel không?

---

## Appendix A: Environment Variables

### Worker (.env)
```
# Server connection
CC_SERVER_URL=wss://cc-server.example.com
CC_API_KEY=worker_xxxxxxxx

# Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# Worker settings
CC_WORKER_NAME=my-worker
CC_WORKING_DIR=/path/to/projects
```

### Server (.env)
```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/cc_worker

# Server
PORT=3000
NEXTAUTH_SECRET=xxxxx

# Optional
LOG_LEVEL=info
```

---

## Appendix B: Message Types (TypeScript)

```typescript
// Shared types between worker and server

export interface WorkerInfo {
  id: string;
  name: string;
  os: string;
  hostname: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  lastSeen: Date;
}

export interface Task {
  id: string;
  prompt: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  workerId?: string;
  result?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: 'SYSTEM' | 'TEXT' | 'THINKING' | 'TOOL_USE' | 'TOOL_RESULT' | 'ERROR';
  content: any;
  timestamp: Date;
}

// WebSocket events
export interface TaskAssignEvent {
  taskId: string;
  prompt: string;
}

export interface TaskLogEvent {
  taskId: string;
  type: TaskLog['type'];
  content: any;
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
```

---

*Document maintained by: Development Team*
*Last updated: 2025-12-26*
