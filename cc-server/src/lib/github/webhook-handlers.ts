/**
 * GitHub Webhook Event Handlers
 *
 * Processes incoming webhook events and creates appropriate tasks.
 */

import prisma from '../prisma';
import { fetchPRDiff, isLargePR, getFileSummary } from './pr-diff-fetcher';
import { addCommentReaction, getPullRequest } from './api-client';
import type { PRReviewContext } from '@/types';

const BOT_USERNAME = process.env.GITHUB_BOT_USERNAME || 'cc-worker-bot';

// GitHub Webhook Payload Types
interface GitHubUser {
  id: number;
  login: string;
  type: string;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  default_branch: string;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser;
  head: { sha: string; ref: string };
  base: { ref: string };
  html_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface GitHubInstallation {
  id: number;
  account: GitHubUser;
}

interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
}

interface GitHubIssue {
  number: number;
  title: string;
  pull_request?: { url: string };
}

export interface PullRequestWebhookPayload {
  action: string;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  installation: GitHubInstallation;
  sender: GitHubUser;
}

export interface IssueCommentWebhookPayload {
  action: string;
  comment: GitHubComment;
  issue: GitHubIssue;
  repository: GitHubRepository;
  installation: GitHubInstallation;
  sender: GitHubUser;
}

export interface InstallationWebhookPayload {
  action: string;
  installation: GitHubInstallation;
  repositories?: Array<{ id: number; name: string; full_name: string }>;
  sender: GitHubUser;
}

/**
 * Handle pull_request.opened or pull_request.synchronize events
 */
export async function handlePullRequestOpened(
  payload: PullRequestWebhookPayload
): Promise<{ taskId: string | null; skipped: boolean; reason?: string }> {
  const { pull_request, repository, installation } = payload;

  console.log(
    `[GitHub Webhook] PR #${pull_request.number} ${payload.action} in ${repository.full_name}`
  );

  // Find repo config
  const repoConfig = await prisma.gitHubRepository.findUnique({
    where: { repoId: repository.id },
    include: { installation: true },
  });

  if (!repoConfig) {
    console.log(`[GitHub Webhook] Repository ${repository.full_name} not configured, skipping`);
    return { taskId: null, skipped: true, reason: 'Repository not configured' };
  }

  if (!repoConfig.autoReviewEnabled) {
    console.log(`[GitHub Webhook] Auto-review disabled for ${repository.full_name}, skipping`);
    return { taskId: null, skipped: true, reason: 'Auto-review disabled' };
  }

  // Create the review task (handles duplicate check internally with proper race condition handling)
  const result = await createPRReviewTask({
    repoConfig,
    installationId: installation.id,
    pr: pull_request,
    repository,
    triggeredBy: 'auto',
  });

  if (result.skipped) {
    return { taskId: null, skipped: true, reason: result.reason };
  }

  return { taskId: result.taskId, skipped: false };
}

/**
 * Handle issue_comment.created events for @mentions
 */
export async function handleIssueComment(
  payload: IssueCommentWebhookPayload
): Promise<{ taskId: string | null; skipped: boolean; reason?: string }> {
  const { comment, issue, repository, installation } = payload;

  // Only process PR comments
  if (!issue.pull_request) {
    return { taskId: null, skipped: true, reason: 'Not a PR comment' };
  }

  // Check for @mention
  if (!comment.body.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) {
    return { taskId: null, skipped: true, reason: 'Bot not mentioned' };
  }

  console.log(
    `[GitHub Webhook] Bot mentioned in PR #${issue.number} by ${comment.user.login}`
  );

  // Find repo config
  const repoConfig = await prisma.gitHubRepository.findUnique({
    where: { repoId: repository.id },
    include: { installation: true },
  });

  if (!repoConfig) {
    console.log(`[GitHub Webhook] Repository ${repository.full_name} not configured`);
    return { taskId: null, skipped: true, reason: 'Repository not configured' };
  }

  if (!repoConfig.reviewOnMention) {
    console.log(`[GitHub Webhook] Mention-review disabled for ${repository.full_name}`);
    return { taskId: null, skipped: true, reason: 'Mention-review disabled' };
  }

  // Add reaction to acknowledge the mention
  try {
    await addCommentReaction(
      installation.id,
      repository.owner.login,
      repository.name,
      comment.id,
      'eyes'
    );
  } catch (error) {
    console.warn('[GitHub Webhook] Failed to add reaction:', error);
  }

  // Fetch full PR details
  const pr = await getPullRequest(
    installation.id,
    repository.owner.login,
    repository.name,
    issue.number
  );

  // Create the review task (handles duplicate check internally with proper race condition handling)
  const result = await createPRReviewTask({
    repoConfig,
    installationId: installation.id,
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      user: pr.user,
      head: pr.head,
      base: pr.base,
      html_url: pr.html_url,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
    },
    repository,
    triggeredBy: `mention:${comment.user.login}`,
  });

  if (result.skipped) {
    return { taskId: null, skipped: true, reason: result.reason };
  }

  return { taskId: result.taskId, skipped: false };
}

/**
 * Handle installation events (created, deleted)
 */
export async function handleInstallation(
  payload: InstallationWebhookPayload
): Promise<void> {
  const { action, installation, repositories } = payload;

  console.log(
    `[GitHub Webhook] Installation ${action}: ${installation.account.login} (${installation.id})`
  );

  if (action === 'created') {
    // Create installation record
    await prisma.gitHubInstallation.upsert({
      where: { installationId: installation.id },
      create: {
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        accountId: installation.account.id,
      },
      update: {
        accountLogin: installation.account.login,
        accountType: installation.account.type,
      },
    });

    // Create repository records
    if (repositories) {
      const installationRecord = await prisma.gitHubInstallation.findUnique({
        where: { installationId: installation.id },
      });

      if (installationRecord) {
        for (const repo of repositories) {
          await prisma.gitHubRepository.upsert({
            where: { repoId: repo.id },
            create: {
              installationId: installationRecord.id,
              repoId: repo.id,
              owner: repo.full_name.split('/')[0],
              name: repo.name,
              fullName: repo.full_name,
            },
            update: {
              fullName: repo.full_name,
            },
          });
        }
      }
    }
  } else if (action === 'deleted') {
    // Delete installation (cascade will delete repos and reviews)
    await prisma.gitHubInstallation.delete({
      where: { installationId: installation.id },
    }).catch((error) => {
      // Installation might not exist - log for debugging but don't fail
      console.debug(
        `[GitHub Webhook] Installation ${installation.id} already deleted or not found:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    });
  }
}

/**
 * Find an available worker assigned to this repository
 * Returns the worker ID or null if no worker is available
 */
async function findWorkerForRepo(repositoryId: string): Promise<string | null> {
  // Find workers assigned to this repo that are ONLINE (not BUSY)
  const assignment = await prisma.workerRepository.findFirst({
    where: {
      repositoryId,
      worker: {
        status: 'ONLINE',
      },
    },
    include: {
      worker: true,
    },
    orderBy: {
      worker: {
        lastSeen: 'desc', // Prefer most recently active worker
      },
    },
  });

  if (assignment) {
    console.log(
      `[GitHub Webhook] Found worker ${assignment.worker.name} for repo ${repositoryId}`
    );
    return assignment.workerId;
  }

  // If no ONLINE worker, check if any worker is assigned at all
  const anyAssignment = await prisma.workerRepository.findFirst({
    where: { repositoryId },
    include: { worker: true },
  });

  if (anyAssignment) {
    console.log(
      `[GitHub Webhook] Worker ${anyAssignment.worker.name} assigned but status is ${anyAssignment.worker.status}, task will queue`
    );
    return anyAssignment.workerId; // Return the worker ID, task will wait in queue
  }

  console.log(`[GitHub Webhook] No worker assigned to repo ${repositoryId}`);
  return null;
}

interface CreatePRReviewResult {
  taskId: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * Create a PR review task
 * Uses optimistic concurrency to handle race conditions - attempts to create
 * the review record first and catches unique constraint violations.
 */
async function createPRReviewTask(params: {
  repoConfig: { id: string; owner: string; name: string; fullName: string };
  installationId: number;
  pr: GitHubPullRequest;
  repository: GitHubRepository;
  triggeredBy: string;
}): Promise<CreatePRReviewResult> {
  const { repoConfig, installationId, pr, repository, triggeredBy } = params;

  // Find a worker assigned to this repository
  const targetWorkerId = await findWorkerForRepo(repoConfig.id);

  if (!targetWorkerId) {
    console.log(
      `[GitHub Webhook] No worker assigned to ${repoConfig.fullName}, cannot create PR review task`
    );
    return { taskId: null, skipped: true, reason: 'No worker assigned' };
  }

  // Fetch the diff first (before attempting to create records)
  const diff = await fetchPRDiff(
    installationId,
    repository.owner.login,
    repository.name,
    pr.number
  );

  // Build PR review context
  const prReviewContext: PRReviewContext = {
    repository: {
      owner: repository.owner.login,
      name: repository.name,
      defaultBranch: repository.default_branch,
    },
    pullRequest: {
      number: pr.number,
      title: pr.title,
      description: pr.body,
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      url: pr.html_url,
      headSha: pr.head.sha,
    },
    files: diff.files.map((f) => ({
      filename: f.filename,
      status: f.status as 'added' | 'modified' | 'deleted' | 'renamed',
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    })),
    diff: diff.content,
    installationId,
  };

  // Build prompt
  let prompt = buildReviewPrompt(prReviewContext, diff);

  // Add note for large PRs
  if (isLargePR(diff.stats)) {
    prompt += '\n\n**Note:** This is a large PR. Focus on the most critical issues.';
    prompt += '\n\n' + getFileSummary(diff.files);
  }

  // Use a transaction to atomically create task and review record
  // This handles race conditions via unique constraint violation
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create task with specific worker assignment
      const task = await tx.task.create({
        data: {
          prompt,
          status: 'PENDING',
          priority: 50, // Medium-high priority for PR reviews
          taskType: 'PR_REVIEW',
          workerId: targetWorkerId, // Pre-assign to specific worker
        },
      });

      // Create PR review record - unique constraint will fail if duplicate
      await tx.gitHubPRReview.create({
        data: {
          repositoryId: repoConfig.id,
          prNumber: pr.number,
          prTitle: pr.title,
          prAuthor: pr.user.login,
          headSha: pr.head.sha,
          taskId: task.id,
          status: 'PENDING',
          triggeredBy,
        },
      });

      return task.id;
    });

    console.log(
      `[GitHub Webhook] Created PR review task ${result} for PR #${pr.number} -> worker ${targetWorkerId}`
    );

    return { taskId: result, skipped: false };
  } catch (error) {
    // Handle unique constraint violation (P2002) - another webhook already created this review
    if ((error as { code?: string }).code === 'P2002') {
      console.log(
        `[GitHub Webhook] Review already exists for PR #${pr.number} @ ${pr.head.sha.substring(0, 7)} (concurrent request)`
      );
      return { taskId: null, skipped: true, reason: 'Review already exists' };
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Build the review prompt for Claude
 */
function buildReviewPrompt(context: PRReviewContext, diff: { stats: { additions: number; deletions: number; changedFiles: number } }): string {
  return `You are reviewing a GitHub Pull Request. Please provide a thorough code review.

## Pull Request Information
- **Repository:** ${context.repository.owner}/${context.repository.name}
- **PR #${context.pullRequest.number}:** ${context.pullRequest.title}
- **Author:** @${context.pullRequest.author}
- **Branch:** ${context.pullRequest.headBranch} -> ${context.pullRequest.baseBranch}
- **Changes:** +${diff.stats.additions} -${diff.stats.deletions} in ${diff.stats.changedFiles} files

## PR Description
${context.pullRequest.description || '(No description provided)'}

## Changed Files
${context.files.map((f) => `- ${f.status.toUpperCase()} ${f.filename} (+${f.additions} -${f.deletions})`).join('\n')}

## Diff
\`\`\`diff
${context.diff}
\`\`\`

## Review Instructions
Please review this pull request and provide:

1. **Summary**: A brief overview of what this PR does
2. **Code Quality**: Analysis of code style, patterns, and best practices
3. **Potential Issues**: Bugs, security concerns, or edge cases
4. **Suggestions**: Specific improvements with code examples
5. **Overall Assessment**: Approve, Request Changes, or Comment

Format your response as a well-structured markdown comment suitable for posting on GitHub.
Keep the review constructive and actionable.`;
}
