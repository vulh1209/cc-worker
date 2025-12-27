/**
 * Test fixtures for Worker data
 */

import type { Worker, Task, WorkerStatus, TaskStatus, TaskType } from '@prisma/client';

export const createMockWorker = (overrides?: Partial<Worker>): Worker => {
  return {
    id: 'worker-1',
    name: 'Test Worker',
    apiKey: 'test-api-key',
    apiKeyHash: 'hashed-api-key',
    status: 'ONLINE' as WorkerStatus,
    os: 'darwin',
    hostname: 'test-machine',
    ipAddress: '127.0.0.1',
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isOrchestrator: false,
    orchestratorConfig: null,
    ownerId: null,
    ...overrides,
  };
};

export const createMockTask = (overrides?: Partial<Task>): Task => {
  return {
    id: 'task-1',
    prompt: 'Test task prompt',
    status: 'PENDING' as TaskStatus,
    priority: 0,
    workerId: null,
    result: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    duration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sessionId: null,
    parentTaskId: null,
    taskType: 'REGULAR' as TaskType,
    orchestratedByTaskId: null,
    orchestrationDepth: 0,
    routingDecision: null,
    ...overrides,
  };
};

export const createMockGitHubRepository = (overrides?: any) => {
  return {
    id: 'repo-1',
    installationId: 'installation-1',
    repoId: 12345,
    owner: 'test-owner',
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    autoReviewEnabled: true,
    reviewOnMention: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

export const createMockPullRequest = (overrides?: any) => {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test PR description',
    state: 'open',
    user: {
      id: 1,
      login: 'test-user',
      type: 'User',
    },
    head: {
      sha: 'abc123def456',
      ref: 'feature-branch',
    },
    base: {
      ref: 'main',
    },
    html_url: 'https://github.com/test-owner/test-repo/pull/1',
    additions: 10,
    deletions: 5,
    changed_files: 2,
    ...overrides,
  };
};
