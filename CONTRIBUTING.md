# Contributing to CC-Worker

First off, thank you for considering contributing to CC-Worker! It's people like you that make CC-Worker such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL
- Git
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cc-worker.git
   # Or clone the original repo:
   # git clone https://github.com/vulh1209/cc-worker.git
   cd cc-worker
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/vulh1209/cc-worker.git
   ```

4. **Setup the server**
   ```bash
   cd cc-server
   npm install
   cp .env.example .env
   # Configure your DATABASE_URL in .env
   npm run db:push
   npm run dev
   ```

5. **Setup the worker** (in a new terminal)
   ```bash
   cd cc-worker
   npm install
   cp .env.example .env
   # Configure worker settings in .env
   npm run dev
   ```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates.

When creating a bug report, include:
- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, etc.)
- **Logs or screenshots** if applicable

### Suggesting Features

Feature requests are welcome! Please:
- Check if the feature has already been requested
- Provide a clear description of the feature
- Explain why this feature would be useful
- Consider how it fits with the project's goals

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:
- `good first issue` - Simple issues for newcomers
- `help wanted` - Issues that need attention

## Pull Request Process

### Branch Naming

Use descriptive branch names:
```
feature/add-task-retry-logic
fix/websocket-reconnection
docs/update-api-reference
refactor/simplify-worker-manager
```

### Creating a Pull Request

1. **Update your fork**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Write clean, readable code
   - Add tests if applicable
   - Update documentation if needed

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add task retry logic"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Fill out the PR template
   - Link related issues
   - Request reviews from maintainers

### PR Requirements

- [ ] Code follows project coding standards
- [ ] All tests pass
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow convention
- [ ] No merge conflicts with main branch

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer `interface` over `type` for object shapes
- Use meaningful variable and function names

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line structures
- Maximum line length: 100 characters

### File Organization

```
src/
├── components/    # React components (server)
├── lib/           # Shared utilities
├── core/          # Core business logic
└── utils/         # Helper functions
```

### Testing

- Write tests for new features
- Maintain existing test coverage
- Use descriptive test names

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, etc.) |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```
feat(worker): add automatic reconnection logic

fix(server): resolve WebSocket memory leak

docs: update installation instructions

refactor(task-queue): simplify priority sorting
```

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainers.

---

Thank you for contributing! 🎉
