/**
 * Tests for GitHub Webhook Handlers
 *
 * Testing current behavior to protect against regressions during refactoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockGitHubRepository, createMockPullRequest } from '../../../test/fixtures/worker-data';

// Mock modules - must be before imports
vi.mock('../../prisma', () => ({
  default: {
    gitHubRepository: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    gitHubInstallation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    gitHubPRReview: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
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
    $transaction: vi.fn((callback) => callback({
      task: {
        create: vi.fn(),
        update: vi.fn(),
      },
      gitHubPRReview: {
        create: vi.fn(),
      },
    })),
  },
}));

vi.mock('../pr-diff-fetcher', () => ({
  fetchPRDiff: vi.fn().mockResolvedValue({
    content: 'mock diff content',
    files: [
      {
        filename: 'test.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: 'mock patch',
      },
    ],
    stats: {
      additions: 10,
      deletions: 5,
      changedFiles: 1,
    },
  }),
  isLargePR: vi.fn().mockReturnValue(false),
  getFileSummary: vi.fn().mockReturnValue(''),
}));

vi.mock('../api-client', () => ({
  addCommentReaction: vi.fn().mockResolvedValue(undefined),
  getPullRequest: vi.fn().mockResolvedValue(createMockPullRequest()),
}));

vi.mock('../pr-review-handler', () => ({
  handlePRReviewCompleted: vi.fn().mockResolvedValue({ success: true, commentUrl: 'https://github.com/...' }),
  handlePRReviewFailed: vi.fn().mockResolvedValue(undefined),
}));

import {
  handlePullRequestOpened,
  handleIssueComment,
  handleInstallation,
  type PullRequestWebhookPayload,
  type IssueCommentWebhookPayload,
  type InstallationWebhookPayload,
} from '../webhook-handlers';

describe('GitHub Webhook Handlers', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import('../../prisma');
    mockPrisma = prismaModule.default;
  });

  describe('handlePullRequestOpened', () => {
    const createPRPayload = (overrides?: any): PullRequestWebhookPayload => ({
      action: 'opened',
      pull_request: createMockPullRequest(overrides?.pull_request),
      repository: {
        id: 12345,
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        owner: {
          id: 1,
          login: 'test-owner',
          type: 'Organization',
        },
        default_branch: 'main',
      },
      installation: {
        id: 123,
        account: {
          id: 1,
          login: 'test-owner',
          type: 'Organization',
        },
      },
      sender: {
        id: 2,
        login: 'pr-author',
        type: 'User',
      },
      ...overrides,
    });

    it('should create PR review task for configured repository', async () => {
      const payload = createPRPayload();
      const mockRepo = createMockGitHubRepository();
      const mockWorker = { id: 'worker-1', name: 'Test Worker', status: 'ONLINE' };
      const mockTask = { id: 'task-1' };

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue({
        workerId: mockWorker.id,
        worker: mockWorker,
      });

      // Mock transaction
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          task: {
            create: vi.fn().mockResolvedValue(mockTask),
          },
          gitHubPRReview: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await handlePullRequestOpened(payload);

      expect(result.taskId).toBe('task-1');
      expect(result.skipped).toBe(false);
      expect(mockPrisma.gitHubRepository.findUnique).toHaveBeenCalledWith({
        where: { repoId: 12345 },
        include: { installation: true },
      });
    });

    it('should skip if repository not configured', async () => {
      const payload = createPRPayload();

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue(null);

      const result = await handlePullRequestOpened(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Repository not configured');
      expect(result.taskId).toBe(null);
    });

    it('should skip if auto-review is disabled', async () => {
      const payload = createPRPayload();
      const mockRepo = createMockGitHubRepository({ autoReviewEnabled: false });

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });

      const result = await handlePullRequestOpened(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Auto-review disabled');
    });

    it('should skip if no worker assigned to repository', async () => {
      const payload = createPRPayload();
      const mockRepo = createMockGitHubRepository();

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue(null);

      const result = await handlePullRequestOpened(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('No worker assigned');
    });

    it('should handle duplicate review creation (race condition)', async () => {
      const payload = createPRPayload();
      const mockRepo = createMockGitHubRepository();
      const mockWorker = { id: 'worker-1', name: 'Test Worker', status: 'ONLINE' };

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue({
        workerId: mockWorker.id,
        worker: mockWorker,
      });

      // Mock Prisma unique constraint violation
      const uniqueConstraintError = new Error('Unique constraint violation');
      (uniqueConstraintError as any).code = 'P2002';
      mockPrisma.$transaction.mockRejectedValue(uniqueConstraintError);

      const result = await handlePullRequestOpened(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Review already exists');
    });
  });

  describe('handleIssueComment', () => {
    const createCommentPayload = (overrides?: any): IssueCommentWebhookPayload => ({
      action: 'created',
      comment: {
        id: 123,
        body: '@cc-worker-bot please review this',
        user: {
          id: 1,
          login: 'commenter',
          type: 'User',
        },
      },
      issue: {
        number: 1,
        title: 'Test Issue',
        pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/1' },
      },
      repository: {
        id: 12345,
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        owner: {
          id: 1,
          login: 'test-owner',
          type: 'Organization',
        },
        default_branch: 'main',
      },
      installation: {
        id: 123,
        account: {
          id: 1,
          login: 'test-owner',
          type: 'Organization',
        },
      },
      sender: {
        id: 1,
        login: 'commenter',
        type: 'User',
      },
      ...overrides,
    });

    it('should skip non-PR comments', async () => {
      const payload = createCommentPayload();
      delete payload.issue.pull_request;

      const result = await handleIssueComment(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Not a PR comment');
    });

    it('should skip comments without bot mention', async () => {
      const payload = createCommentPayload({
        comment: {
          id: 123,
          body: 'This is a regular comment',
          user: { id: 1, login: 'commenter', type: 'User' },
        },
      });

      const result = await handleIssueComment(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Bot not mentioned');
    });

    it('should create review task when bot is mentioned', async () => {
      const payload = createCommentPayload();
      const mockRepo = createMockGitHubRepository();
      const mockWorker = { id: 'worker-1', name: 'Test Worker', status: 'ONLINE' };
      const mockTask = { id: 'task-1' };

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue({
        workerId: mockWorker.id,
        worker: mockWorker,
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          task: {
            create: vi.fn().mockResolvedValue(mockTask),
          },
          gitHubPRReview: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await handleIssueComment(payload);

      expect(result.taskId).toBe('task-1');
      expect(result.skipped).toBe(false);

      // Verify reaction was added
      const apiClient = await import('../api-client');
      expect(apiClient.addCommentReaction).toHaveBeenCalledWith(
        123,
        'test-owner',
        'test-repo',
        123,
        'eyes'
      );
    });

    it('should skip if reviewOnMention is disabled', async () => {
      const payload = createCommentPayload();
      const mockRepo = createMockGitHubRepository({ reviewOnMention: false });

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });

      const result = await handleIssueComment(payload);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Mention-review disabled');
    });

    it('should be case-insensitive for bot mention', async () => {
      const payload = createCommentPayload({
        comment: {
          id: 123,
          body: '@CC-WORKER-BOT Please Review',
          user: { id: 1, login: 'commenter', type: 'User' },
        },
      });
      const mockRepo = createMockGitHubRepository();
      const mockWorker = { id: 'worker-1', name: 'Test Worker', status: 'ONLINE' };
      const mockTask = { id: 'task-1' };

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue({
        workerId: mockWorker.id,
        worker: mockWorker,
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          task: {
            create: vi.fn().mockResolvedValue(mockTask),
          },
          gitHubPRReview: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await handleIssueComment(payload);

      expect(result.taskId).toBe('task-1');
      expect(result.skipped).toBe(false);
    });
  });

  describe('handleInstallation', () => {
    const createInstallationPayload = (overrides?: any): InstallationWebhookPayload => ({
      action: 'created',
      installation: {
        id: 123,
        account: {
          id: 1,
          login: 'test-owner',
          type: 'Organization',
        },
      },
      repositories: [
        { id: 12345, name: 'test-repo', full_name: 'test-owner/test-repo' },
        { id: 67890, name: 'another-repo', full_name: 'test-owner/another-repo' },
      ],
      sender: {
        id: 1,
        login: 'installer',
        type: 'User',
      },
      ...overrides,
    });

    it('should create installation and repositories on installation created', async () => {
      const payload = createInstallationPayload();

      mockPrisma.gitHubInstallation.upsert.mockResolvedValue({
        id: 'installation-db-id',
        installationId: 123,
      });
      mockPrisma.gitHubInstallation.findUnique.mockResolvedValue({
        id: 'installation-db-id',
        installationId: 123,
      });
      mockPrisma.gitHubRepository.upsert.mockResolvedValue({});

      await handleInstallation(payload);

      expect(mockPrisma.gitHubInstallation.upsert).toHaveBeenCalledWith({
        where: { installationId: 123 },
        create: {
          installationId: 123,
          accountLogin: 'test-owner',
          accountType: 'Organization',
          accountId: 1,
        },
        update: {
          accountLogin: 'test-owner',
          accountType: 'Organization',
        },
      });

      expect(mockPrisma.gitHubRepository.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.gitHubRepository.upsert).toHaveBeenCalledWith({
        where: { repoId: 12345 },
        create: {
          installationId: 'installation-db-id',
          repoId: 12345,
          owner: 'test-owner',
          name: 'test-repo',
          fullName: 'test-owner/test-repo',
        },
        update: {
          fullName: 'test-owner/test-repo',
        },
      });
    });

    it('should delete installation on installation deleted', async () => {
      const payload = createInstallationPayload({ action: 'deleted' });

      mockPrisma.gitHubInstallation.delete.mockResolvedValue({});

      await handleInstallation(payload);

      expect(mockPrisma.gitHubInstallation.delete).toHaveBeenCalledWith({
        where: { installationId: 123 },
      });
    });

    it('should handle deletion of non-existent installation gracefully', async () => {
      const payload = createInstallationPayload({ action: 'deleted' });

      mockPrisma.gitHubInstallation.delete.mockRejectedValue(
        new Error('Record not found')
      );

      // Should not throw
      await expect(handleInstallation(payload)).resolves.toBeUndefined();
    });

    it('should handle installation created without repositories', async () => {
      const payload = createInstallationPayload({ repositories: undefined });

      mockPrisma.gitHubInstallation.upsert.mockResolvedValue({
        id: 'installation-db-id',
        installationId: 123,
      });

      await handleInstallation(payload);

      expect(mockPrisma.gitHubInstallation.upsert).toHaveBeenCalled();
      expect(mockPrisma.gitHubRepository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle large PR diffs', async () => {
      const prDiffFetcher = await import('../pr-diff-fetcher');
      (prDiffFetcher.isLargePR as any).mockReturnValue(true);
      (prDiffFetcher.getFileSummary as any).mockReturnValue('File summary...');

      const payload: PullRequestWebhookPayload = {
        action: 'opened',
        pull_request: createMockPullRequest({
          additions: 5000,
          deletions: 3000,
          changed_files: 100,
        }),
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'test-owner/test-repo',
          owner: { id: 1, login: 'test-owner', type: 'Organization' },
          default_branch: 'main',
        },
        installation: {
          id: 123,
          account: { id: 1, login: 'test-owner', type: 'Organization' },
        },
        sender: { id: 2, login: 'pr-author', type: 'User' },
      };

      const mockRepo = createMockGitHubRepository();
      const mockWorker = { id: 'worker-1', name: 'Test Worker', status: 'ONLINE' };
      const mockTask = { id: 'task-1' };

      mockPrisma.gitHubRepository.findUnique.mockResolvedValue({
        ...mockRepo,
        installation: { id: 'installation-1' },
      });
      mockPrisma.workerRepository.findFirst.mockResolvedValue({
        workerId: mockWorker.id,
        worker: mockWorker,
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          task: {
            create: vi.fn().mockResolvedValue(mockTask),
          },
          gitHubPRReview: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await handlePullRequestOpened(payload);

      expect(result.taskId).toBe('task-1');
      expect(prDiffFetcher.getFileSummary).toHaveBeenCalled();
    });
  });
});
