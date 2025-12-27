/**
 * Tests for TaskExecutor
 *
 * Testing current behavior to protect against regressions during refactoring.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskExecutor } from '../TaskExecutor';
import type { WorkerConfig } from '../../config';
import type { TaskLogCallback } from '../TaskExecutor';

// Mock the Claude SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

describe('TaskExecutor', () => {
  let executor: TaskExecutor;
  let mockConfig: WorkerConfig;
  let logCallback: TaskLogCallback;
  let capturedLogs: any[];

  beforeEach(() => {
    capturedLogs = [];
    logCallback = vi.fn((log) => {
      capturedLogs.push(log);
    });

    mockConfig = {
      serverUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      workingDirectory: '/tmp/test-workspace',
      workerName: 'test-worker',
      autoUpdate: false,
      cliPath: undefined,
      assignedRepos: [],
      isOrchestrator: false,
      orchestratorConfig: undefined,
    };

    executor = new TaskExecutor(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(executor).toBeDefined();
      expect(executor.isExecuting).toBe(false);
      expect(executor.currentTask).toBe(null);
    });
  });

  describe('Task Execution', () => {
    it('should execute a simple task successfully', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      // Mock successful execution
      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Task completed successfully' },
            ],
          },
          session_id: 'session-123',
        };
      });

      const result = await executor.execute(
        'task-1',
        'Test prompt',
        logCallback
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Task completed successfully');
      expect(result.sessionId).toBe('session-123');
      expect(result.duration).toBeGreaterThan(0);
      expect(logCallback).toHaveBeenCalled();
    });

    it('should log system message at start', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Done' }],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      expect(capturedLogs[0]).toEqual({
        type: 'SYSTEM',
        content: expect.objectContaining({
          message: 'Task execution started',
          prompt: expect.any(String),
        }),
      });
    });

    it('should handle text content blocks', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Hello world' },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      const textLog = capturedLogs.find((log) => log.type === 'TEXT');
      expect(textLog).toEqual({
        type: 'TEXT',
        content: { text: 'Hello world' },
      });
    });

    it('should handle thinking blocks', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'Let me analyze this problem...' },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      const thinkingLog = capturedLogs.find((log) => log.type === 'THINKING');
      expect(thinkingLog).toEqual({
        type: 'THINKING',
        content: { thinking: 'Let me analyze this problem...' },
      });
    });

    it('should handle tool use blocks', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: { file_path: '/test/file.ts' },
              },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      const toolLog = capturedLogs.find((log) => log.type === 'TOOL_USE');
      expect(toolLog).toEqual({
        type: 'TOOL_USE',
        content: {
          tool: 'Read',
          id: 'tool-1',
          input: { file_path: '/test/file.ts' },
        },
      });
    });

    it('should handle tool result blocks', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'File contents here',
                is_error: false,
              },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      const resultLog = capturedLogs.find((log) => log.type === 'TOOL_RESULT');
      expect(resultLog).toEqual({
        type: 'TOOL_RESULT',
        content: {
          toolUseId: 'tool-1',
          result: 'File contents here',
          isError: false,
        },
      });
    });

    it('should truncate large tool inputs', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const largeInput = 'x'.repeat(2000);

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Write',
                input: { content: largeInput },
              },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test prompt', logCallback);

      const toolLog = capturedLogs.find((log) => log.type === 'TOOL_USE');

      // The sanitize function tries to JSON.parse truncated input
      // The result should have content field truncated to around 1000 chars
      const content = toolLog.content.input.content || JSON.stringify(toolLog.content.input);

      // Should be truncated (either string truncation or JSON parse truncation)
      expect(content.length).toBeLessThanOrEqual(1010); // 1000 + some overhead
    });

    it('should handle errors during execution', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        throw new Error('Execution failed');
      });

      const result = await executor.execute('task-1', 'Test prompt', logCallback);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
      expect(result.duration).toBeGreaterThanOrEqual(0); // Duration can be 0 for immediate failures

      const errorLog = capturedLogs.find((log) => log.type === 'ERROR');
      expect(errorLog).toEqual({
        type: 'ERROR',
        content: { message: 'Execution failed' },
      });
    });

    it('should validate working directory', async () => {
      const invalidConfig = {
        ...mockConfig,
        workingDirectory: '',
      };

      const invalidExecutor = new TaskExecutor(invalidConfig);

      const result = await invalidExecutor.execute('task-1', 'Test prompt', logCallback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid working directory');
    });

    it('should normalize Windows paths', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      const windowsConfig = {
        ...mockConfig,
        workingDirectory: 'C:/Users/test/workspace',
      };

      const windowsExecutor = new TaskExecutor(windowsConfig);

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Done' }],
          },
        };
      });

      await windowsExecutor.execute('task-1', 'Test prompt', logCallback);

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            cwd: expect.stringContaining('\\'),
          }),
        })
      );

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Session Resume', () => {
    it('should resume from previous session', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Resumed successfully' }],
          },
          session_id: 'session-123',
        };
      });

      const result = await executor.execute(
        'task-2',
        'Follow-up prompt',
        logCallback,
        'session-123' // Resume session
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-123');

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            resume: 'session-123',
          }),
        })
      );

      const systemLog = capturedLogs[0];
      expect(systemLog.content).toEqual(
        expect.objectContaining({
          message: 'Resuming session with follow-up prompt',
          resumeSessionId: 'session-123',
        })
      );
    });

    it('should capture session ID even on failure', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Starting...' }],
          },
          session_id: 'session-456',
        };
        throw new Error('Task failed');
      });

      const result = await executor.execute('task-1', 'Test prompt', logCallback);

      expect(result.success).toBe(false);
      expect(result.sessionId).toBe('session-456'); // Should still capture session
    });
  });

  describe('Task Cancellation', () => {
    it('should cancel running task', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      let cancelled = false;

      (query as any).mockImplementation(async function* ({ options }: any) {
        const signal = options.abortController.signal;

        // Simulate long-running task
        for (let i = 0; i < 10; i++) {
          if (signal.aborted) {
            cancelled = true;
            throw new Error('Task cancelled');
          }

          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: `Step ${i}` }],
            },
          };

          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      // Start execution (don't await yet)
      const executionPromise = executor.execute('task-1', 'Long task', logCallback);

      // Wait a bit, then cancel
      await new Promise(resolve => setTimeout(resolve, 50));
      const cancelResult = executor.cancel();

      expect(cancelResult).toBe(true);

      const result = await executionPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task cancelled');
      expect(cancelled).toBe(true);
    });

    it('should return false when cancelling non-running task', () => {
      const result = executor.cancel();
      expect(result).toBe(false);
    });

    it('should track executing state', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      let resolveGenerator: () => void;
      const generatorPromise = new Promise<void>(resolve => {
        resolveGenerator = resolve;
      });

      (query as any).mockImplementation(async function* () {
        // Wait before yielding to ensure we can check state
        await new Promise(resolve => setTimeout(resolve, 50));
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Working...' }],
          },
        };
        resolveGenerator();
      });

      expect(executor.isExecuting).toBe(false);
      expect(executor.currentTask).toBe(null);

      const executionPromise = executor.execute('task-1', 'Test', logCallback);

      // Wait for generator to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Should be executing now
      expect(executor.isExecuting).toBe(true);
      expect(executor.currentTask).toBe('task-1');

      await executionPromise;

      // Should be done now
      expect(executor.isExecuting).toBe(false);
      expect(executor.currentTask).toBe(null);
    });
  });

  describe('Query Options', () => {
    it('should use custom CLI path if provided', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const customConfig = {
        ...mockConfig,
        cliPath: '/custom/path/to/cli',
      };

      const customExecutor = new TaskExecutor(customConfig);

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Done' }],
          },
        };
      });

      await customExecutor.execute('task-1', 'Test', logCallback);

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            pathToClaudeCodeExecutable: '/custom/path/to/cli',
          }),
        })
      );
    });

    it('should use allowed tools from config', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Done' }],
          },
        };
      });

      await executor.execute('task-1', 'Test', logCallback);

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS'],
            maxTurns: 50,
            dangerouslySkipPermissions: true,
          }),
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple content blocks in one message', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'Analyzing...' },
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/test' } },
              { type: 'text', text: 'Done analyzing' },
            ],
          },
        };
      });

      await executor.execute('task-1', 'Test', logCallback);

      expect(capturedLogs.filter(log => log.type === 'THINKING')).toHaveLength(1);
      expect(capturedLogs.filter(log => log.type === 'TOOL_USE')).toHaveLength(1);
      expect(capturedLogs.filter(log => log.type === 'TEXT')).toHaveLength(1);
    });

    it('should handle result message type', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'result',
          final: 'Task completed',
        };
      });

      await executor.execute('task-1', 'Test', logCallback);

      const systemLog = capturedLogs.find(
        log => log.type === 'SYSTEM' && log.content.message === 'Execution completed'
      );
      expect(systemLog).toBeDefined();
    });

    it('should extract final result from last text block', async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      (query as any).mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'First response' }],
          },
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Final result' }],
          },
        };
      });

      const result = await executor.execute('task-1', 'Test', logCallback);

      expect(result.result).toBe('Final result'); // Should use last text
    });
  });
});
