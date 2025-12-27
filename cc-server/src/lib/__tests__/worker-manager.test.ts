/**
 * Tests for WorkerManager
 *
 * Testing current behavior to protect against regressions during refactoring.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockSocketServer, createMockSocket } from '../../test/mocks/socket-io';
import { createMockWorker, createMockTask } from '../../test/fixtures/worker-data';

// Mock modules - must be before imports to avoid hoisting issues
vi.mock('../prisma', () => ({
  default: {
    worker: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    taskLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workerRepository: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../pr-review-handler', () => ({
  handlePRReviewCompleted: vi.fn(),
  handlePRReviewFailed: vi.fn(),
}));

vi.mock('../orchestration-handler', () => ({
  getOrchestrationHandler: vi.fn(() => ({
    handleDecision: vi.fn(),
  })),
}));

import { WorkerManager } from '../worker-manager';

describe('WorkerManager', () => {
  let workerManager: WorkerManager;
  let mockIo: any;
  let mockPrisma: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mocked prisma
    const prismaModule = await import('../prisma');
    mockPrisma = prismaModule.default;

    // Create mock Socket.IO server
    mockIo = createMockSocketServer();

    // Create WorkerManager instance
    workerManager = new WorkerManager(mockIo);
  });

  afterEach(() => {
    workerManager.stopHeartbeatMonitor();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with a Socket.IO server', () => {
      expect(workerManager).toBeDefined();
      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should clean up stale workers on startup', async () => {
      mockPrisma.worker.updateMany.mockResolvedValue({ count: 2 });

      // Create new instance to trigger cleanup
      const newManager = new WorkerManager(mockIo);

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockPrisma.worker.updateMany).toHaveBeenCalledWith({
        where: { status: { in: ['ONLINE', 'BUSY'] } },
        data: { status: 'OFFLINE' },
      });

      newManager.stopHeartbeatMonitor();
    });

    it('should start heartbeat monitor on initialization', () => {
      expect(workerManager).toBeDefined();
      // Heartbeat monitor is started in constructor
    });
  });

  describe('Worker Registration', () => {
    it('should register a worker with valid API key', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'ONLINE' });

      // Simulate connection
      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];

      connectionHandler(mockSocket);

      // Simulate worker registration
      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];

      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      expect(mockPrisma.worker.findUnique).toHaveBeenCalledWith({
        where: { apiKey: 'test-api-key' },
      });

      expect(mockPrisma.worker.update).toHaveBeenCalledWith({
        where: { id: mockWorker.id },
        data: expect.objectContaining({
          status: 'ONLINE',
          os: 'darwin',
          hostname: 'test-machine',
        }),
      });

      expect(mockSocket.join).toHaveBeenCalledWith(`worker:${mockWorker.id}`);
      expect(mockIo.emit).toHaveBeenCalledWith('worker:updated', expect.any(Object));
    });

    it('should reject registration with invalid API key', async () => {
      const mockSocket = createMockSocket();

      mockPrisma.worker.findUnique.mockResolvedValue(null);

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];

      await registerHandler({
        apiKey: 'invalid-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Invalid API key' });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should prevent multiple orchestrators', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();
      const existingOrchestrator = createMockWorker({
        id: 'orchestrator-1',
        isOrchestrator: true
      });

      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.findFirst.mockResolvedValue(existingOrchestrator);
      mockPrisma.worker.update.mockResolvedValue({
        ...mockWorker,
        status: 'ONLINE',
        isOrchestrator: false // Should be denied
      });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];

      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
        isOrchestrator: true, // Requesting to be orchestrator
      });

      expect(mockPrisma.worker.update).toHaveBeenCalledWith({
        where: { id: mockWorker.id },
        data: expect.objectContaining({
          isOrchestrator: false, // Should be denied
        }),
      });
    });
  });

  describe('Worker Heartbeat', () => {
    it('should update worker status on heartbeat', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      // Register worker first
      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      // Now send heartbeat
      const heartbeatHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:heartbeat'
      )?.[1];

      await heartbeatHandler({
        status: 'BUSY',
      });

      expect(mockPrisma.worker.update).toHaveBeenCalledWith({
        where: { id: mockWorker.id },
        data: {
          status: 'BUSY',
          lastSeen: expect.any(Date),
        },
      });
    });
  });

  describe('Task Assignment', () => {
    it('should assign task to online worker', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      // Register worker
      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      // Assign task
      const success = await workerManager.assignTask(
        mockWorker.id,
        'task-1',
        'Test prompt'
      );

      expect(success).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('task:assign', {
        taskId: 'task-1',
        prompt: 'Test prompt',
        sessionId: undefined,
        parentTaskId: undefined,
        taskType: undefined,
        availableWorkers: undefined,
        orchestrationDepth: undefined,
      });
    });

    it('should return false when assigning to unknown worker', async () => {
      const success = await workerManager.assignTask(
        'unknown-worker-id',
        'task-1',
        'Test prompt'
      );

      expect(success).toBe(false);
    });

    it('should include available workers when assigning to orchestrator', async () => {
      const mockSocket = createMockSocket();
      const mockOrchestrator = createMockWorker({
        id: 'orchestrator-1',
        isOrchestrator: true
      });
      const mockWorker2 = createMockWorker({ id: 'worker-2', name: 'Worker 2' });

      // Register orchestrator
      mockPrisma.worker.findUnique.mockResolvedValue(mockOrchestrator);
      mockPrisma.worker.findFirst.mockResolvedValue(null); // No existing orchestrator
      mockPrisma.worker.update.mockResolvedValue({
        ...mockOrchestrator,
        status: 'ONLINE',
        isOrchestrator: true
      });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
        isOrchestrator: true,
      });

      // Mock findMany for available workers
      mockPrisma.worker.findMany.mockResolvedValue([mockWorker2]);

      // Assign REGULAR task to orchestrator
      const success = await workerManager.assignTask(
        mockOrchestrator.id,
        'task-1',
        'Test prompt',
        undefined,
        undefined,
        'REGULAR'
      );

      expect(success).toBe(true);
      expect(mockPrisma.worker.findMany).toHaveBeenCalledWith({
        where: { status: 'ONLINE', isOrchestrator: false },
        select: expect.any(Object),
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('task:assign',
        expect.objectContaining({
          availableWorkers: expect.any(Array),
        })
      );
    });
  });

  describe('Task Lifecycle Events', () => {
    let mockSocket: any;
    let mockWorker: any;

    beforeEach(async () => {
      mockSocket = createMockSocket();
      mockWorker = createMockWorker();

      // Register worker
      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });
    });

    it('should handle task started event', async () => {
      const mockTask = createMockTask({ id: 'task-1' });
      mockPrisma.task.update.mockResolvedValue({
        ...mockTask,
        status: 'RUNNING',
        workerId: mockWorker.id,
      });

      const startedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'task:started'
      )?.[1];

      await startedHandler({ taskId: 'task-1' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'RUNNING',
          workerId: mockWorker.id,
          startedAt: expect.any(Date),
        },
      });

      expect(mockIo.to).toHaveBeenCalledWith('task:task-1');
    });

    it('should handle task log event', async () => {
      mockPrisma.taskLog.create.mockResolvedValue({
        id: 'log-1',
        taskId: 'task-1',
        type: 'TEXT',
        content: { text: 'Test log' },
        timestamp: new Date(),
      });

      const logHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'task:log'
      )?.[1];

      await logHandler({
        taskId: 'task-1',
        type: 'TEXT',
        content: { text: 'Test log' },
        timestamp: new Date().toISOString(),
      });

      expect(mockPrisma.taskLog.create).toHaveBeenCalled();
      expect(mockIo.to).toHaveBeenCalledWith('task:task-1');
    });

    it('should handle task completed event', async () => {
      const mockTask = createMockTask({ id: 'task-1', taskType: 'REGULAR' });
      mockPrisma.task.update.mockResolvedValue({
        ...mockTask,
        status: 'COMPLETED',
        result: 'Task completed successfully',
      });

      const completedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'task:completed'
      )?.[1];

      await completedHandler({
        taskId: 'task-1',
        result: 'Task completed successfully',
        duration: 5000,
        sessionId: 'session-123',
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'COMPLETED',
          result: 'Task completed successfully',
          duration: 5000,
          completedAt: expect.any(Date),
          sessionId: 'session-123',
        },
      });

      expect(mockPrisma.worker.update).toHaveBeenCalledWith({
        where: { id: mockWorker.id },
        data: { status: 'ONLINE' },
      });
    });

    it('should handle task failed event', async () => {
      const mockTask = createMockTask({ id: 'task-1', taskType: 'REGULAR' });
      mockPrisma.task.update.mockResolvedValue({
        ...mockTask,
        status: 'FAILED',
        errorMessage: 'Task failed',
      });

      const failedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'task:failed'
      )?.[1];

      await failedHandler({
        taskId: 'task-1',
        error: 'Task failed',
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'FAILED',
          errorMessage: 'Task failed',
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('Task Cancellation', () => {
    it('should cancel task on online worker', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      // Register worker
      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      // Cancel task
      const success = await workerManager.cancelTask(mockWorker.id, 'task-1');

      expect(success).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('task:cancel', { taskId: 'task-1' });
    });

    it('should return false when cancelling on unknown worker', async () => {
      const success = await workerManager.cancelTask('unknown-worker', 'task-1');
      expect(success).toBe(false);
    });
  });

  describe('Browser Subscriptions', () => {
    it('should allow browser to subscribe to task updates', async () => {
      const mockSocket = createMockSocket();

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const subscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:task'
      )?.[1];

      subscribeHandler('task-1');

      expect(mockSocket.join).toHaveBeenCalledWith('task:task-1');
    });

    it('should allow browser to unsubscribe from task updates', async () => {
      const mockSocket = createMockSocket();

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const unsubscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'unsubscribe:task'
      )?.[1];

      unsubscribeHandler('task-1');

      expect(mockSocket.leave).toHaveBeenCalledWith('task:task-1');
    });

    it('should allow browser to subscribe to worker updates', async () => {
      const mockSocket = createMockSocket();

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const subscribeHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'subscribe:worker'
      )?.[1];

      subscribeHandler('worker-1');

      expect(mockSocket.join).toHaveBeenCalledWith('worker:worker-1');
    });
  });

  describe('Worker Disconnect', () => {
    it('should mark worker offline on disconnect', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ ...mockWorker, status: 'OFFLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({
        apiKey: 'test-api-key',
        os: 'darwin',
        hostname: 'test-machine',
      });

      // Simulate disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];
      await disconnectHandler();

      expect(mockPrisma.worker.update).toHaveBeenCalledWith({
        where: { id: mockWorker.id },
        data: { status: 'OFFLINE' },
      });

      expect(mockIo.emit).toHaveBeenCalledWith('worker:updated', expect.objectContaining({
        status: 'OFFLINE',
      }));
    });
  });

  describe('Utility Methods', () => {
    it('should return list of online workers', async () => {
      const mockSocket1 = createMockSocket();
      const mockSocket2 = { ...createMockSocket(), id: 'socket-2' };
      const mockWorker1 = createMockWorker({ id: 'worker-1' });
      const mockWorker2 = createMockWorker({ id: 'worker-2' });

      mockPrisma.worker.findUnique
        .mockResolvedValueOnce(mockWorker1)
        .mockResolvedValueOnce(mockWorker2);
      mockPrisma.worker.update.mockResolvedValue({ status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];

      // Register two workers
      connectionHandler(mockSocket1);
      const registerHandler1 = mockSocket1.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler1({ apiKey: 'key-1', os: 'darwin', hostname: 'machine-1' });

      connectionHandler(mockSocket2);
      const registerHandler2 = mockSocket2.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler2({ apiKey: 'key-2', os: 'darwin', hostname: 'machine-2' });

      const onlineWorkers = workerManager.getOnlineWorkers();

      expect(onlineWorkers).toHaveLength(2);
      expect(onlineWorkers).toContain('worker-1');
      expect(onlineWorkers).toContain('worker-2');
    });

    it('should return connected worker count', async () => {
      const mockSocket = createMockSocket();
      const mockWorker = createMockWorker();

      mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
      mockPrisma.worker.update.mockResolvedValue({ status: 'ONLINE' });

      const connectionHandler = mockIo.on.mock.calls.find(
        (call: any[]) => call[0] === 'connection'
      )?.[1];
      connectionHandler(mockSocket);

      const registerHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'worker:register'
      )?.[1];
      await registerHandler({ apiKey: 'test-key', os: 'darwin', hostname: 'test' });

      const count = workerManager.getConnectedCount();

      expect(count).toBe(1);
    });
  });
});
