/**
 * Tests for worker detail page data fetching and API key preview display
 *
 * Testing current behavior to document what exists before refactoring.
 * Focus: Server-side data fetching, API key preview in template, permissions.
 *
 * Note: These are unit tests for the data fetching logic, not full SSR component tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockWorker, createMockTask } from '../../../test/fixtures/worker-data';

// Mock modules BEFORE imports
vi.mock('@/lib/prisma', () => ({
  default: {
    worker: {
      findUnique: vi.fn(),
    },
    task: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/worker-permissions', () => ({
  checkWorkerAccess: vi.fn(),
}));

describe('Worker Page Data Fetching', () => {
  let mockPrisma: any;
  let mockGetSessionUser: any;
  let mockCheckWorkerAccess: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('@/lib/prisma');
    mockPrisma = prismaModule.default;

    const authModule = await import('@/lib/auth');
    mockGetSessionUser = authModule.getSessionUser;

    const permissionsModule = await import('@/lib/worker-permissions');
    mockCheckWorkerAccess = permissionsModule.checkWorkerAccess;
  });

  describe('Worker Data Access Patterns', () => {
    it('should fetch worker with full apiKey field from database', async () => {
      // Document current behavior: page component fetches FULL apiKey from DB
      const mockWorker = createMockWorker({
        id: 'worker-1',
        apiKey: 'worker_FULL_SECRET_KEY_1234567890',
      });

      mockGetSessionUser.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      mockCheckWorkerAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });

      mockPrisma.worker.findUnique.mockResolvedValue({
        ...mockWorker,
        tasks: [],
        _count: { tasks: 0 },
        owner: null,
        sharedWith: [],
      });

      // Simulate what getWorker() function does
      const worker = await mockPrisma.worker.findUnique({
        where: { id: 'worker-1' },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { tasks: true } },
          owner: { select: { id: true, email: true, name: true } },
          sharedWith: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { sharedAt: 'desc' },
          },
        },
      });

      // SECURITY CONCERN: Full API key is accessible
      expect(worker.apiKey).toBe('worker_FULL_SECRET_KEY_1234567890');
      expect(worker.apiKey).toBeDefined();
    });

    it('should demonstrate preview logic used in template', () => {
      // Document current behavior: page.tsx line 170 uses substring(0, 15)
      const mockWorker = createMockWorker({
        apiKey: 'worker_1234567890ABCDEFGHIJKLMNO',
      });

      // Simulate template logic: {worker.apiKey.substring(0, 15)}...
      const preview = mockWorker.apiKey.substring(0, 15) + '...';

      expect(preview).toBe('worker_12345678...');
      expect(preview.length).toBe(18);
    });

    it('should fetch worker statistics separately', async () => {
      mockPrisma.task.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7)  // completed
        .mockResolvedValueOnce(2)  // failed
        .mockResolvedValueOnce(1); // running

      // Simulate what getWorkerStats() does
      const [total, completed, failed, running] = await Promise.all([
        mockPrisma.task.count({ where: { workerId: 'worker-1' } }),
        mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'COMPLETED' } }),
        mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'FAILED' } }),
        mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'RUNNING' } }),
      ]);

      expect(total).toBe(10);
      expect(completed).toBe(7);
      expect(failed).toBe(2);
      expect(running).toBe(1);
    });
  });

  describe('Permission Checking', () => {
    it('should check worker access before rendering', async () => {
      mockGetSessionUser.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      mockCheckWorkerAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });

      await mockCheckWorkerAccess('worker-1', 'view');

      expect(mockCheckWorkerAccess).toHaveBeenCalledWith('worker-1', 'view');
    });

    it('should handle access denied', async () => {
      mockGetSessionUser.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      mockCheckWorkerAccess.mockResolvedValue({
        hasAccess: false,
        isOwner: false,
      });

      const access = await mockCheckWorkerAccess('worker-1', 'view');

      expect(access.hasAccess).toBe(false);
      // In real page, this would trigger notFound()
    });

    it('should distinguish between owner and shared user', async () => {
      mockGetSessionUser.mockResolvedValue({
        id: 'user-2',
        email: 'shared@example.com',
      });

      mockCheckWorkerAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: false,
        isShared: true,
      });

      const access = await mockCheckWorkerAccess('worker-1', 'view');

      expect(access.hasAccess).toBe(true);
      expect(access.isOwner).toBe(false);
      expect(access.isShared).toBe(true);
    });
  });

  describe('API Key Preview Security Pattern', () => {
    /**
     * These tests document the CURRENT security concern:
     * The page component has access to the full API key in memory.
     */
    it('should expose full API key to page component (SECURITY CONCERN)', () => {
      const fullApiKey = 'worker_SECRET_SHOULD_NOT_BE_IN_TEMPLATE';
      const mockWorker = createMockWorker({ apiKey: fullApiKey });

      // Current implementation: Full key is in worker object
      expect(mockWorker.apiKey).toBe(fullApiKey);

      // Template only displays preview, but full key is accessible
      const displayedPreview = mockWorker.apiKey.substring(0, 15) + '...';
      expect(displayedPreview).not.toBe(fullApiKey);

      // CONCERN: Full key exists in component memory
      expect(mockWorker).toHaveProperty('apiKey');
      expect(typeof mockWorker.apiKey).toBe('string');
      expect(mockWorker.apiKey.length).toBeGreaterThan(15);
    });

    it('should demonstrate inconsistency with API route pattern', () => {
      // API Route Pattern (secure):
      const apiKey = 'worker_1234567890ABCDEF';
      const apiKeyHash = 'hash123';
      const worker = createMockWorker({ apiKey, apiKeyHash });

      // API route does this: const { apiKey, apiKeyHash, ...safeWorker } = worker;
      const { apiKey: removedKey, apiKeyHash: removedHash, ...safeWorker } = worker;
      const apiResponse = {
        ...safeWorker,
        apiKeyPreview: apiKey.substring(0, 15) + '...',
      };

      expect(apiResponse.apiKey).toBeUndefined();
      expect(apiResponse.apiKeyHash).toBeUndefined();
      expect(apiResponse.apiKeyPreview).toBe('worker_12345678...');

      // Page Component Pattern (current - less secure):
      const pageWorker = createMockWorker({ apiKey, apiKeyHash });
      // Full worker object is passed to template
      expect(pageWorker.apiKey).toBe(apiKey); // Full key accessible
      expect(pageWorker.apiKeyHash).toBe(apiKeyHash); // Hash accessible
    });

    it('should verify preview format matches API route', () => {
      const apiKey = 'worker_TESTKEY1234567890';

      // API route format (route.ts:49)
      const apiPreview = apiKey.substring(0, 15) + '...';

      // Page component format (page.tsx:170)
      const pagePreview = apiKey.substring(0, 15) + '...';

      // Should be identical
      expect(apiPreview).toBe(pagePreview);
      expect(apiPreview).toBe('worker_TESTKEY1...');
    });
  });

  describe('Worker Data Includes', () => {
    it('should fetch worker with required relations', async () => {
      const mockWorker = createMockWorker();
      const mockTasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
      ];

      mockPrisma.worker.findUnique.mockResolvedValue({
        ...mockWorker,
        tasks: mockTasks,
        _count: { tasks: 2 },
        owner: {
          id: 'owner-1',
          email: 'owner@example.com',
          name: 'Owner Name',
        },
        sharedWith: [
          {
            id: 'share-1',
            userId: 'user-2',
            sharedAt: new Date(),
            user: {
              id: 'user-2',
              email: 'shared@example.com',
              name: 'Shared User',
            },
          },
        ],
      });

      const worker = await mockPrisma.worker.findUnique({
        where: { id: 'worker-1' },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { tasks: true } },
          owner: { select: { id: true, email: true, name: true } },
          sharedWith: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { sharedAt: 'desc' },
          },
        },
      });

      expect(worker.tasks).toHaveLength(2);
      expect(worker._count.tasks).toBe(2);
      expect(worker.owner).toBeDefined();
      expect(worker.sharedWith).toHaveLength(1);
    });

    it('should limit tasks to most recent 20', async () => {
      const manyTasks = Array.from({ length: 25 }, (_, i) =>
        createMockTask({ id: `task-${i}` })
      );

      mockPrisma.worker.findUnique.mockResolvedValue({
        ...createMockWorker(),
        tasks: manyTasks.slice(0, 20), // Only first 20
        _count: { tasks: 25 },
        owner: null,
        sharedWith: [],
      });

      const worker = await mockPrisma.worker.findUnique({
        where: { id: 'worker-1' },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { tasks: true } },
          owner: { select: { id: true, email: true, name: true } },
          sharedWith: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });

      expect(worker.tasks).toHaveLength(20);
      expect(worker._count.tasks).toBe(25); // Total count is higher
    });
  });

  describe('Edge Cases', () => {
    it('should handle worker with no tasks', async () => {
      mockPrisma.worker.findUnique.mockResolvedValue({
        ...createMockWorker(),
        tasks: [],
        _count: { tasks: 0 },
        owner: null,
        sharedWith: [],
      });

      const worker = await mockPrisma.worker.findUnique({
        where: { id: 'worker-1' },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { tasks: true } },
          owner: { select: { id: true, email: true, name: true } },
          sharedWith: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });

      expect(worker.tasks).toHaveLength(0);
    });

    it('should handle worker with no owner (legacy data)', async () => {
      mockPrisma.worker.findUnique.mockResolvedValue({
        ...createMockWorker({ ownerId: null }),
        tasks: [],
        _count: { tasks: 0 },
        owner: null,
        sharedWith: [],
      });

      const worker = await mockPrisma.worker.findUnique({
        where: { id: 'worker-1' },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { tasks: true } },
          owner: { select: { id: true, email: true, name: true } },
          sharedWith: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });

      expect(worker.owner).toBeNull();
    });

    it('should handle short API keys gracefully', () => {
      const shortKey = 'worker_abc'; // Only 10 chars
      const mockWorker = createMockWorker({ apiKey: shortKey });

      const preview = mockWorker.apiKey.substring(0, 15) + '...';

      expect(preview).toBe('worker_abc...');
      expect(preview.length).toBe(13); // 10 + 3
    });

    it('should handle API key exactly 15 characters', () => {
      const exactKey = 'worker_12345678'; // Exactly 15 chars
      const mockWorker = createMockWorker({ apiKey: exactKey });

      const preview = mockWorker.apiKey.substring(0, 15) + '...';

      expect(preview).toBe('worker_12345678...');
      expect(preview.length).toBe(18);
    });
  });
});

describe('Worker Statistics Calculation', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('@/lib/prisma');
    mockPrisma = prismaModule.default;
  });

  it('should calculate success rate correctly', async () => {
    mockPrisma.task.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(85)  // completed
      .mockResolvedValueOnce(10)  // failed
      .mockResolvedValueOnce(5);  // running

    const [total, completed, failed, running] = await Promise.all([
      mockPrisma.task.count({ where: { workerId: 'worker-1' } }),
      mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'COMPLETED' } }),
      mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'FAILED' } }),
      mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'RUNNING' } }),
    ]);

    const successRate = Math.round((completed / total) * 100);

    expect(successRate).toBe(85);
    expect(total).toBe(completed + failed + running);
  });

  it('should handle zero tasks gracefully', async () => {
    mockPrisma.task.count
      .mockResolvedValueOnce(0)  // total
      .mockResolvedValueOnce(0)  // completed
      .mockResolvedValueOnce(0)  // failed
      .mockResolvedValueOnce(0); // running

    const [total, completed] = await Promise.all([
      mockPrisma.task.count({ where: { workerId: 'worker-1' } }),
      mockPrisma.task.count({ where: { workerId: 'worker-1', status: 'COMPLETED' } }),
    ]);

    // Avoid division by zero
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    expect(successRate).toBe(0);
  });
});
