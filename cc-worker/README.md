# CC-Worker

Distributed Claude Code Worker Bot - connects to a central server and executes Claude tasks.

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a configuration file at one of these locations:
- `./cc-worker.config.json`
- `./.cc-worker.json`
- `~/.cc-worker/config.json`

Or use environment variables (`.env` file):

```env
CC_SERVER_URL=ws://localhost:3000
CC_API_KEY=worker_xxxxxxxx
CC_WORKER_NAME=my-worker
CC_WORKING_DIR=/path/to/projects
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

### Run in Development

```bash
npm run dev
```

### Build & Run

```bash
npm run build
npm start
```

### Build Standalone Binary

```bash
npm run build:binary
```

This creates binaries in the `binaries/` folder for:
- macOS (x64 & arm64)
- Windows (x64)
- Linux (x64)

## Configuration Options

| Option | Env Variable | Description | Default |
|--------|--------------|-------------|---------|
| serverUrl | CC_SERVER_URL | WebSocket server URL | Required |
| apiKey | CC_API_KEY | Worker API key | Required |
| workerName | CC_WORKER_NAME | Worker display name | Required |
| workingDirectory | CC_WORKING_DIR | Claude working directory | Required |
| claudeApiKey | ANTHROPIC_API_KEY | Anthropic API key | Optional |
| maxConcurrentTasks | CC_MAX_CONCURRENT_TASKS | Max concurrent tasks | 1 |
| reconnectInterval | CC_RECONNECT_INTERVAL | Reconnect delay (ms) | 5000 |
| heartbeatInterval | CC_HEARTBEAT_INTERVAL | Heartbeat interval (ms) | 30000 |

## Architecture

```
cc-worker/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Configuration loader
│   ├── worker/
│   │   ├── WorkerClient.ts    # Main orchestrator
│   │   ├── WebSocketClient.ts # Socket.io connection
│   │   └── TaskExecutor.ts    # Claude SDK integration
│   ├── types/
│   │   └── index.ts       # Type definitions
│   └── utils/
│       ├── logger.ts      # Logging utility
│       └── system-info.ts # OS information
└── package.json
```

## Features

- **Auto-reconnect**: Automatically reconnects on connection loss
- **Heartbeat**: Sends periodic heartbeats to maintain connection
- **Task Streaming**: Streams Claude output in real-time
- **Task Cancellation**: Supports cancelling running tasks
- **Cross-platform**: Runs on macOS, Windows, and Linux
