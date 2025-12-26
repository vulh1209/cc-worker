import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.blue('[DEBUG]'),
        message,
        ...args
      );
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.green('[INFO]'),
        message,
        ...args
      );
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.log(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.yellow('[WARN]'),
        message,
        ...args
      );
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) {
      console.error(
        chalk.gray(`[${formatTimestamp()}]`),
        chalk.red('[ERROR]'),
        message,
        ...args
      );
    }
  },

  // Special formatters for task output
  taskStart: (taskId: string, prompt: string) => {
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      chalk.cyan('▶ Task Started:'),
      chalk.bold(taskId)
    );
    console.log(chalk.gray('  Prompt:'), prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
  },

  taskComplete: (taskId: string, duration: number) => {
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      chalk.green('✓ Task Completed:'),
      chalk.bold(taskId),
      chalk.gray(`(${duration}ms)`)
    );
  },

  taskFailed: (taskId: string, error: string) => {
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      chalk.red('✗ Task Failed:'),
      chalk.bold(taskId)
    );
    console.log(chalk.red('  Error:'), error);
  },

  connection: (status: 'connected' | 'disconnected' | 'reconnecting') => {
    const icon = status === 'connected' ? '🟢' : status === 'disconnected' ? '🔴' : '🟡';
    console.log(
      chalk.gray(`[${formatTimestamp()}]`),
      icon,
      chalk.bold(status.toUpperCase())
    );
  },
};
