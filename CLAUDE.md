# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CC-Worker is a distributed system for running Claude Code tasks remotely:
- **cc-worker**: Worker bot that connects to the central server and executes Claude tasks using the Claude Code SDK
- **cc-server**: Next.js dashboard for managing workers and tasks with real-time WebSocket communication

## Commands

This project uses **pnpm** as the package manager with workspace support.

### Root (monorepo)
```bash
pnpm install         # Install all dependencies for both packages
```

### Server (cc-server/)
```bash
pnpm run dev          # Start dev server with hot reload (tsx watch server.ts)
pnpm run build        # Build Next.js for production
pnpm start            # Start production server
pnpm run db:push      # Push schema to database (use during dev)
pnpm run db:migrate   # Run migrations (use for production)
pnpm run db:studio    # Open Prisma Studio GUI
```

### Worker (cc-worker/)
```bash
pnpm run dev               # Start worker in dev mode (tsx watch)
pnpm run build             # Compile TypeScript
pnpm run build:binary      # Build for current platform
pnpm run build:binary:all  # Build for macOS x64/arm64, Windows, Linux
```

## Architecture

### Communication Flow
```
Browser <--Socket.io--> CC-Server <--Socket.io--> CC-Worker(s)
                            |
                       PostgreSQL
```

### Key Design Decisions

**Custom Server (server.ts)**: The server uses a custom HTTP server instead of `next dev` to integrate Socket.io on the same port. This is necessary because Next.js doesn't natively support WebSocket.

**Worker Manager Pattern**: `WorkerManager` (src/lib/worker-manager.ts) maintains two maps:
- `workers: Map<socketId, ConnectedWorker>` - tracks socket connections
- `workerIdToSocket: Map<workerId, socketId>` - enables task assignment by worker ID

**Task Execution Flow**:
1. Browser creates task via API → Task saved as PENDING
2. TaskQueue processor finds available worker and assigns via WebSocket
3. Worker's TaskExecutor calls Claude Code SDK's `query()` function
4. Logs stream back via `task:log` events to subscribed browsers
5. Final result sent via `task:completed` or `task:failed`

**Claude Code SDK Integration**: The worker uses `@anthropic-ai/claude-code` SDK's `query()` function with AbortController for cancellation. Authentication uses CLI session (`claude login`) - no ANTHROPIC_API_KEY needed in worker config.

### WebSocket Protocol

Worker → Server: `worker:register`, `worker:heartbeat` (30s), `task:started/log/completed/failed`

Server → Worker: `task:assign { taskId, prompt }`, `task:cancel { taskId }`

Browser clients subscribe via `subscribe:task` / `subscribe:worker` events for real-time updates.

## Configuration

### Worker Config Priority
1. `./cc-worker.config.json`
2. `./.cc-worker.json`
3. `~/.cc-worker/config.json`
4. Environment variables (highest priority)

Required: `CC_SERVER_URL`, `CC_API_KEY`, `CC_WORKER_NAME`, `CC_WORKING_DIR`

### Server Environment
Required: `DATABASE_URL` (PostgreSQL connection string)

## Database Notes

- Workers authenticate via API key (stored as `apiKey` field, compared directly)
- Tasks have `priority` field for queue ordering (higher = more priority)
- TaskLogs store JSON content for flexible log types (tool calls, thinking, etc.)
- TaskMetric aggregates daily stats per worker for analytics page

## GitHub PR Review Integration

The system supports automated PR code reviews via GitHub App integration.

### Setup
1. Create a GitHub App with webhook events: `pull_request`, `issue_comment`, `installation`
2. Configure webhook URL: `https://your-server.com/api/webhooks/github`
3. Set environment variables:
   - `GITHUB_APP_ID` - App ID from GitHub
   - `GITHUB_PRIVATE_KEY` - Private key (PEM format, base64 encoded)
   - `GITHUB_WEBHOOK_SECRET` - Webhook secret for signature verification
   - `GITHUB_BOT_USERNAME` - Bot username for @mention detection

### Worker-Repository Assignment
Workers can be assigned to specific repos for PR review routing:
- Via worker config: `"assignedRepos": ["owner/repo"]` in `cc-worker.config.json`
- Via API: `POST /api/workers/{id}/repositories`
- Via script: `pnpm run db:assign-repo` in cc-server

### PR Review Flow
1. GitHub webhook triggers on PR open or @bot mention in PR comment
2. Server finds worker assigned to the repository
3. Task created with type `PR_REVIEW` and assigned to specific worker
4. Worker executes review using Claude
5. Result posted as GitHub PR comment automatically
