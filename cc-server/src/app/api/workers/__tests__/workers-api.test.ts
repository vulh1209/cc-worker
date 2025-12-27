/**
 * Integration tests for /api/workers/[id] route
 *
 * Testing current behavior to protect against regressions during refactoring.
 * Focus: API key preview in response, security patterns, permission checks.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockWorker, createMockTask } from '../../../../test/fixtures/worker-data';

// Mock modules BEFORE imports to avoid hoisting issues
vi.mock('@/lib/prisma', () => ({
  default: {
    worker: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/worker-permissions', () => ({
  requireWorkerAccess: vi.fn(),
}));

// Import AFTER mocks
import { GET, DELETE } from '../[id]/route';

describe('GET /api/workers/:id', () => {
  let mockPrisma: any;
  let mockRequireWorkerAccess: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('@/lib/prisma');
    mockPrisma = prismaModule.default;

    const permissionsModule = await import('@/lib/worker-permissions');
    mockRequireWorkerAccess = permissionsModule.requireWorkerAccess;
  });

  const createMockRequest = (id: string) => {
    return {
      url: `http://localhost:3000/api/workers/${id}`,
      method: 'GET',
    } as NextRequest;
  };

  const createMockParams = (id: string) => {
    return {
      params: Promise.resolve({ id }),
    };
  };

  it('should return worker with apiKeyPreview instead of full apiKey', async () => {
    const mockWorker = createMockWorker({
      id: 'worker-1',
      name: 'Test Worker',
      apiKey: 'worker_1234567890abcdefghijklmnop',
      apiKeyHash: 'hash123',
    });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
      isShared: false,
      userId: 'user-1',
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      sharedWith: [],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    // Should include apiKeyPreview
    expect(data.apiKeyPreview).toBeDefined();
    expect(data.apiKeyPreview).toBe('worker_12345678...');

    // Should NOT include full apiKey
    expect(data.apiKey).toBeUndefined();

    // Should NOT include apiKeyHash
    expect(data.apiKeyHash).toBeUndefined();
  });

  it('should format apiKeyPreview with substring(0, 15) + "..."', async () => {
    const mockWorker = createMockWorker({
      apiKey: 'worker_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    // Verify exact format: first 15 chars + "..."
    expect(data.apiKeyPreview).toBe('worker_ABCDEFGH...');
    expect(data.apiKeyPreview.length).toBe(18);
  });

  it('should include permission flags in response', async () => {
    const mockWorker = createMockWorker();

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
      isShared: false,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    expect(data.isOwner).toBe(true);
    expect(data.canDelete).toBe(true);
    expect(data.canShare).toBe(true);
  });

  it('should return 403 if user lacks view permission', async () => {
    mockRequireWorkerAccess.mockRejectedValue(
      new Error('Unauthorized: Insufficient permissions')
    );

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Unauthorized');
  });

  it('should return 404 if worker not found', async () => {
    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue(null);

    const request = createMockRequest('nonexistent-worker');
    const params = createMockParams('nonexistent-worker');

    const response = await GET(request, params);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Worker not found');
  });

  it('should check view permission before fetching worker', async () => {
    const mockWorker = createMockWorker();

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      isShared: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    await GET(request, params);

    expect(mockRequireWorkerAccess).toHaveBeenCalledWith('worker-1', 'view');
  });

  it('should include worker tasks in response', async () => {
    const mockTasks = [
      createMockTask({ id: 'task-1', prompt: 'Task 1' }),
      createMockTask({ id: 'task-2', prompt: 'Task 2' }),
    ];

    const mockWorker = createMockWorker();

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: mockTasks,
      _count: { tasks: 2, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    expect(data.tasks).toHaveLength(2);
    expect(data._count.tasks).toBe(2);
  });

  it('should handle shared workers correctly', async () => {
    const mockWorker = createMockWorker();

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false, // Shared user
      isShared: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 1 },
      owner: { id: 'owner-1', email: 'owner@example.com', name: 'Owner' },
      sharedWith: [
        {
          id: 'share-1',
          userId: 'user-2',
          user: { id: 'user-2', email: 'shared@example.com', name: 'Shared User' },
        },
      ],
    });

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await GET(request, params);
    const data = await response.json();

    // Shared user cannot delete
    expect(data.isOwner).toBe(false);
    expect(data.canDelete).toBe(false);
    expect(data.canShare).toBe(false);
  });
});

describe('DELETE /api/workers/:id', () => {
  let mockPrisma: any;
  let mockRequireWorkerAccess: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('@/lib/prisma');
    mockPrisma = prismaModule.default;

    const permissionsModule = await import('@/lib/worker-permissions');
    mockRequireWorkerAccess = permissionsModule.requireWorkerAccess;
  });

  const createMockRequest = (id: string) => {
    return {
      url: `http://localhost:3000/api/workers/${id}`,
      method: 'DELETE',
    } as NextRequest;
  };

  const createMockParams = (id: string) => {
    return {
      params: Promise.resolve({ id }),
    };
  };

  it('should delete worker successfully when user is owner', async () => {
    const mockWorker = createMockWorker({
      id: 'worker-1',
      name: 'Worker to Delete',
    });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
    mockPrisma.worker.delete.mockResolvedValue(mockWorker);

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await DELETE(request, params);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.worker.delete).toHaveBeenCalledWith({
      where: { id: 'worker-1' },
    });
  });

  it('should check delete permission before deleting', async () => {
    const mockWorker = createMockWorker();

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue(mockWorker);
    mockPrisma.worker.delete.mockResolvedValue(mockWorker);

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    await DELETE(request, params);

    expect(mockRequireWorkerAccess).toHaveBeenCalledWith('worker-1', 'delete');
  });

  it('should return 403 if user lacks delete permission', async () => {
    mockRequireWorkerAccess.mockRejectedValue(
      new Error('Unauthorized: Only owner can delete')
    );

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await DELETE(request, params);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Unauthorized');
  });

  it('should return 404 if worker not found', async () => {
    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue(null);

    const request = createMockRequest('nonexistent-worker');
    const params = createMockParams('nonexistent-worker');

    const response = await DELETE(request, params);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Worker not found');
  });

  it('should handle database errors gracefully', async () => {
    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue(createMockWorker());
    mockPrisma.worker.delete.mockRejectedValue(new Error('Database error'));

    const request = createMockRequest('worker-1');
    const params = createMockParams('worker-1');

    const response = await DELETE(request, params);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to delete worker');
  });
});

describe('API Route Security - API Key Protection', () => {
  /**
   * Critical security tests: Verify that sensitive API key data
   * is NEVER exposed in API responses.
   */
  let mockPrisma: any;
  let mockRequireWorkerAccess: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('@/lib/prisma');
    mockPrisma = prismaModule.default;

    const permissionsModule = await import('@/lib/worker-permissions');
    mockRequireWorkerAccess = permissionsModule.requireWorkerAccess;
  });

  it('should NEVER return full apiKey in response', async () => {
    const fullApiKey = 'worker_SECRET_KEY_12345678901234567890';
    const mockWorker = createMockWorker({ apiKey: fullApiKey });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = { url: 'http://localhost:3000/api/workers/worker-1' } as NextRequest;
    const params = { params: Promise.resolve({ id: 'worker-1' }) };

    const response = await GET(request, params);
    const data = await response.json();

    // Verify full key is NOT in response
    expect(data.apiKey).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(fullApiKey);

    // Verify only preview is shown
    expect(data.apiKeyPreview).toBeDefined();
    expect(data.apiKeyPreview).not.toBe(fullApiKey);
  });

  it('should NEVER return apiKeyHash in response', async () => {
    const mockWorker = createMockWorker({
      apiKey: 'worker_test',
      apiKeyHash: 'a'.repeat(64), // SHA-256 hash
    });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = { url: 'http://localhost:3000/api/workers/worker-1' } as NextRequest;
    const params = { params: Promise.resolve({ id: 'worker-1' }) };

    const response = await GET(request, params);
    const data = await response.json();

    // Verify hash is NOT in response
    expect(data.apiKeyHash).toBeUndefined();
  });

  it('should use destructuring to exclude sensitive fields', async () => {
    // This test verifies the security pattern: const { apiKey, apiKeyHash, ...safeWorker } = worker;
    const mockWorker = createMockWorker({
      apiKey: 'worker_sensitive',
      apiKeyHash: 'hash_sensitive',
    });

    mockRequireWorkerAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: true,
    });

    mockPrisma.worker.findUnique.mockResolvedValue({
      ...mockWorker,
      tasks: [],
      _count: { tasks: 0, sharedWith: 0 },
      owner: null,
      sharedWith: [],
    });

    const request = { url: 'http://localhost:3000/api/workers/worker-1' } as NextRequest;
    const params = { params: Promise.resolve({ id: 'worker-1' }) };

    const response = await GET(request, params);
    const data = await response.json();

    // Verify other worker fields are present
    expect(data.id).toBe(mockWorker.id);
    expect(data.name).toBe(mockWorker.name);
    expect(data.status).toBe(mockWorker.status);

    // Verify sensitive fields are excluded
    expect(data.apiKey).toBeUndefined();
    expect(data.apiKeyHash).toBeUndefined();

    // Verify preview is added
    expect(data.apiKeyPreview).toBeDefined();
  });
});
