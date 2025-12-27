/**
 * GitHub API Client
 *
 * Wrapper for GitHub REST API operations with automatic
 * authentication using installation access tokens.
 */

import { getInstallationAccessToken } from './app';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Make an authenticated request to the GitHub API
 */
async function githubRequest<T>(
  installationId: number,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getInstallationAccessToken(installationId);

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Post a comment on a PR (as an issue comment)
 */
export async function postPRComment(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<{ id: number; html_url: string }> {
  return githubRequest(
    installationId,
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    }
  );
}

/**
 * Update an existing comment
 */
export async function updatePRComment(
  installationId: number,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<{ id: number; html_url: string }> {
  return githubRequest(
    installationId,
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }
  );
}

/**
 * Create a PR review with line comments
 */
export async function createPRReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  options: {
    body: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: Array<{
      path: string;
      line: number;
      side?: 'LEFT' | 'RIGHT';
      body: string;
    }>;
  }
): Promise<{ id: number; html_url: string }> {
  return githubRequest(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    {
      method: 'POST',
      body: JSON.stringify({
        body: options.body,
        event: options.event,
        comments: options.comments,
      }),
    }
  );
}

/**
 * Get PR details
 */
export async function getPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string };
  head: { sha: string; ref: string };
  base: { ref: string };
  html_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
}> {
  return githubRequest(
    installationId,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
}

/**
 * Get repository default branch
 */
export async function getRepository(
  installationId: number,
  owner: string,
  repo: string
): Promise<{
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}> {
  return githubRequest(installationId, `/repos/${owner}/${repo}`);
}

/**
 * Add a reaction to a comment (useful for acknowledging @mentions)
 */
export async function addCommentReaction(
  installationId: number,
  owner: string,
  repo: string,
  commentId: number,
  reaction: 'eyes' | 'rocket' | '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray'
): Promise<void> {
  await githubRequest(
    installationId,
    `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
    {
      method: 'POST',
      body: JSON.stringify({ content: reaction }),
    }
  );
}
