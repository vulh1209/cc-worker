<p align="center">
  <img src="https://img.shields.io/badge/Claude-Code-blueviolet?style=for-the-badge&logo=anthropic" alt="Claude Code">
</p>

<h1 align="center">CC-Worker</h1>

<p align="center">
  <strong>Distributed Claude Code Task Runner</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#documentation">Docs</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/vulh1209/cc-worker?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="Node Version">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
</p>

---

## Overview

CC-Worker is a distributed system for running [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) tasks remotely. It enables teams to:

- 🚀 **Scale Claude Code execution** across multiple workers
- 📊 **Monitor tasks in real-time** via a web dashboard
- 🔄 **Distribute workloads** with automatic task queuing
- 📝 **Track execution logs** with full streaming support

## Features

| Feature | Description |
|---------|-------------|
| **Real-time Dashboard** | Next.js web UI with live task status and logs |
| **Worker Management** | Register, monitor, and manage remote workers |
| **Task Queue** | Priority-based task scheduling and distribution |
| **Live Streaming** | WebSocket-based log streaming to browser with immediate display |
| **Cross-platform Workers** | Build workers for macOS, Windows, and Linux |
| **Claude Code SDK** | Native integration with Anthropic's Claude Code |
| **Task Management** | Retry and delete failed tasks functionality |
| **Custom CLI Path** | Support for custom Claude CLI path configuration |
| **Windows Support** | Enhanced Windows binary build and path normalization |

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- Claude Code CLI installed and authenticated (`claude login`)

### 1. Clone the repository

```bash
git clone https://github.com/vulh1209/cc-worker.git
cd cc-worker
```

### 2. Setup the Server

```bash
cd cc-server
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run db:push
npm run dev
```

Server will start at `http://localhost:3000`

### 3. Setup a Worker

```bash
cd cc-worker
npm install
cp .env.example .env
# Edit .env with server URL and API key
npm run dev
```

## Architecture

```
┌─────────────┐     Socket.io      ┌─────────────┐     Socket.io      ┌─────────────┐
│   Browser   │◄──────────────────►│  CC-Server  │◄──────────────────►│  CC-Worker  │
│  (Dashboard)│                    │  (Next.js)  │                    │   (Node.js) │
└─────────────┘                    └──────┬──────┘                    └──────┬──────┘
                                          │                                  │
                                          ▼                                  ▼
                                   ┌─────────────┐                    ┌─────────────┐
                                   │ PostgreSQL  │                    │ Claude Code │
                                   │  Database   │                    │    SDK      │
                                   └─────────────┘                    └─────────────┘
```

### Communication Flow

1. **Browser** creates task via API → Task saved as `PENDING`
2. **TaskQueue** processor finds available worker and assigns via WebSocket
3. **Worker's TaskExecutor** calls Claude Code SDK's `query()` function
4. **Logs stream** back via `task:log` events to subscribed browsers
5. **Final result** sent via `task:completed` or `task:failed`

## Project Structure

```
cc-worker/
├── cc-server/          # Next.js dashboard & API server
│   ├── src/
│   │   ├── app/        # Next.js App Router pages
│   │   ├── components/ # React components
│   │   └── lib/        # Server utilities & WebSocket
│   └── prisma/         # Database schema & migrations
│
├── cc-worker/          # Worker bot executable
│   └── src/
│       ├── core/       # Task executor & socket handler
│       └── utils/      # Config & logging utilities
│
└── docs/               # Additional documentation
```

## Recent Updates (December 26, 2024)

- **Improved Log Streaming**: Logs now stream immediately when navigating to task detail pages
- **Custom CLI Path**: Workers can now specify custom Claude CLI path for different environments
- **Windows Enhancements**: Better Windows binary build support with path normalization
- **Task Management**: Added retry and delete buttons for failed tasks
- **Config Security**: Worker configuration now masks secrets in logs for better security

## Documentation

- [Server Documentation](./cc-server/README.md)
- [Worker Documentation](./cc-worker/README.md)
- [API Reference](./docs/api.md) *(coming soon)*
- [Deployment Guide](./docs/deployment.md) *(coming soon)*

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

Before contributing, please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by the CC-Worker community
</p>
