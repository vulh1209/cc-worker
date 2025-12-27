/**
 * Zod schemas for GitHub webhook payload validation
 *
 * These schemas validate incoming webhook payloads to ensure
 * they have the expected structure before processing.
 */

import { z } from 'zod';

// Base schemas for common types
const GitHubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  type: z.string(),
});

const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: GitHubUserSchema,
  default_branch: z.string(),
});

const GitHubInstallationSchema = z.object({
  id: z.number(),
  account: GitHubUserSchema,
});

// Pull Request webhook payload
const GitHubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  user: GitHubUserSchema,
  head: z.object({
    sha: z.string(),
    ref: z.string(),
  }),
  base: z.object({
    ref: z.string(),
  }),
  html_url: z.string().url(),
  additions: z.number(),
  deletions: z.number(),
  changed_files: z.number(),
});

export const PullRequestWebhookPayloadSchema = z.object({
  action: z.string(),
  pull_request: GitHubPullRequestSchema,
  repository: GitHubRepositorySchema,
  installation: GitHubInstallationSchema,
  sender: GitHubUserSchema,
});

// Issue Comment webhook payload
const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  user: GitHubUserSchema,
});

const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  pull_request: z
    .object({
      url: z.string(),
    })
    .optional(),
});

export const IssueCommentWebhookPayloadSchema = z.object({
  action: z.string(),
  comment: GitHubCommentSchema,
  issue: GitHubIssueSchema,
  repository: GitHubRepositorySchema,
  installation: GitHubInstallationSchema,
  sender: GitHubUserSchema,
});

// Installation webhook payload
export const InstallationWebhookPayloadSchema = z.object({
  action: z.string(),
  installation: GitHubInstallationSchema,
  repositories: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
      })
    )
    .optional(),
  sender: GitHubUserSchema,
});

// Export inferred types
export type ValidatedPullRequestPayload = z.infer<typeof PullRequestWebhookPayloadSchema>;
export type ValidatedIssueCommentPayload = z.infer<typeof IssueCommentWebhookPayloadSchema>;
export type ValidatedInstallationPayload = z.infer<typeof InstallationWebhookPayloadSchema>;

/**
 * Validate a pull request webhook payload
 */
export function validatePullRequestPayload(payload: unknown): ValidatedPullRequestPayload {
  return PullRequestWebhookPayloadSchema.parse(payload);
}

/**
 * Validate an issue comment webhook payload
 */
export function validateIssueCommentPayload(payload: unknown): ValidatedIssueCommentPayload {
  return IssueCommentWebhookPayloadSchema.parse(payload);
}

/**
 * Validate an installation webhook payload
 */
export function validateInstallationPayload(payload: unknown): ValidatedInstallationPayload {
  return InstallationWebhookPayloadSchema.parse(payload);
}
