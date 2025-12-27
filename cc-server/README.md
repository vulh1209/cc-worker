# CC-Server

Central server for CC-Worker distributed Claude Code system. Provides a dashboard for managing workers and tasks.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

```bash
# From the root directory (recommended - uses workspace)
pnpm install

# Or from cc-server directory
cd cc-server && pnpm install
```

### Configuration

Create a `.env` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/cc_worker"
PORT=3000
```

### Database Setup

```bash
# Push schema to database
pnpm run db:push

# Generate Prisma client
pnpm run db:generate

# (Optional) Open Prisma Studio
pnpm run db:studio
```

### Run in Development

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Run

```bash
pnpm run build
pnpm start
```

## Features

### Dashboard
- **Home**: Overview with stats (workers online, tasks running, success rate)
- **Workers**: List all workers, see status, create new workers
- **Tasks**: List all tasks, filter by status, create new tasks
- **Task Detail**: View task details with live log streaming

### API Endpoints

```
# Workers
GET    /api/workers          # List all workers
POST   /api/workers          # Create worker (returns API key)
GET    /api/workers/:id      # Get worker details
DELETE /api/workers/:id      # Delete worker

# Tasks
GET    /api/tasks            # List tasks (with filters)
POST   /api/tasks            # Create new task
GET    /api/tasks/:id        # Get task with logs
POST   /api/tasks/:id/cancel # Cancel running task
GET    /api/tasks/:id/logs   # Get task logs
```

### WebSocket Events

The server uses Socket.io for real-time communication with workers and dashboard.

**Worker → Server:**
- `worker:register` - Register worker on connect
- `worker:heartbeat` - Periodic heartbeat
- `task:started` - Task execution started
- `task:log` - Log entry (streamed)
- `task:completed` - Task completed
- `task:failed` - Task failed

**Server → Worker:**
- `task:assign` - Assign new task
- `task:cancel` - Cancel running task

**Server → Dashboard:**
- `worker:updated` - Worker status changed
- `task:updated` - Task status changed
- `task:log` - New log entry (for live view)

## Architecture

```
cc-server/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout with navigation
│   │   ├── page.tsx          # Dashboard home
│   │   ├── workers/          # Worker pages
│   │   ├── tasks/            # Task pages
│   │   └── api/              # API routes
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── WorkerCard.tsx
│   │   └── LiveLogViewer.tsx
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client
│   │   ├── utils.ts          # Utilities
│   │   ├── worker-manager.ts # Worker state management
│   │   └── websocket-server.ts
│   └── types/
│       └── index.ts          # Type definitions
├── prisma/
│   └── schema.prisma         # Database schema
├── server.ts                 # Custom server with Socket.io
└── package.json
```

## Database Schema

- **Worker**: Workers with API keys, status, system info
- **Task**: Tasks with prompt, status, result, duration
- **TaskLog**: Log entries for each task

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma
- **WebSocket**: Socket.io
- **UI**: shadcn/ui + Tailwind CSS
- **Language**: TypeScript
