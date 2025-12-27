/**
 * GitHub Webhook Handler
 *
 * POST /api/webhooks/github
 *
 * Receives webhook events from GitHub and processes them accordingly.
 * Supports:
 * - pull_request.opened / pull_request.synchronize (auto-review)
 * - issue_comment.created (mention-triggered review)
 * - installation.created / installation.deleted (app lifecycle)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, isWebhookVerificationConfigured } from '@/lib/github/webhook-verification';
import {
  handlePullRequestOpened,
  handleIssueComment,
  handleInstallation,
  type PullRequestWebhookPayload,
  type IssueCommentWebhookPayload,
  type InstallationWebhookPayload,
} from '@/lib/github/webhook-handlers';

export async function POST(request: NextRequest) {
  // Get raw body for signature verification
  const rawBody = await request.text();

  // Verify webhook signature
  if (isWebhookVerificationConfigured()) {
    const signature = request.headers.get('X-Hub-Signature-256');
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('[GitHub Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else {
    console.warn('[GitHub Webhook] Signature verification not configured - accepting all webhooks');
  }

  // Parse event type
  const event = request.headers.get('X-GitHub-Event');
  const deliveryId = request.headers.get('X-GitHub-Delivery');

  console.log(`[GitHub Webhook] Received ${event} event (delivery: ${deliveryId})`);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  try {
    switch (event) {
      case 'pull_request': {
        const prPayload = payload as PullRequestWebhookPayload;

        // Only process opened and synchronize actions
        if (prPayload.action === 'opened' || prPayload.action === 'synchronize') {
          const result = await handlePullRequestOpened(prPayload);
          return NextResponse.json({
            received: true,
            event: 'pull_request',
            action: prPayload.action,
            ...result,
          });
        }

        return NextResponse.json({
          received: true,
          event: 'pull_request',
          action: prPayload.action,
          skipped: true,
          reason: 'Action not handled',
        });
      }

      case 'issue_comment': {
        const commentPayload = payload as IssueCommentWebhookPayload;

        // Only process created comments
        if (commentPayload.action === 'created') {
          const result = await handleIssueComment(commentPayload);
          return NextResponse.json({
            received: true,
            event: 'issue_comment',
            action: commentPayload.action,
            ...result,
          });
        }

        return NextResponse.json({
          received: true,
          event: 'issue_comment',
          action: commentPayload.action,
          skipped: true,
          reason: 'Action not handled',
        });
      }

      case 'installation':
      case 'installation_repositories': {
        const installPayload = payload as InstallationWebhookPayload;
        await handleInstallation(installPayload);
        return NextResponse.json({
          received: true,
          event,
          action: installPayload.action,
        });
      }

      case 'ping': {
        // GitHub sends this when webhook is first configured
        console.log('[GitHub Webhook] Received ping event');
        return NextResponse.json({
          received: true,
          event: 'ping',
          message: 'Pong! Webhook configured successfully.',
        });
      }

      default: {
        console.log(`[GitHub Webhook] Ignoring unhandled event: ${event}`);
        return NextResponse.json({
          received: true,
          event,
          skipped: true,
          reason: 'Event not handled',
        });
      }
    }
  } catch (error) {
    console.error('[GitHub Webhook] Error processing webhook:', error);

    // Differentiate between transient and permanent errors
    // Transient errors (5xx) will trigger GitHub retry
    // Permanent errors (200) prevent unnecessary retries
    if (isTransientError(error)) {
      console.warn('[GitHub Webhook] Transient error - allowing GitHub retry');
      return NextResponse.json(
        { error: 'Temporary failure, please retry' },
        { status: 503 }
      );
    }

    // Permanent failure - acknowledge to prevent retries
    return NextResponse.json({
      received: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Determine if an error is transient (should be retried) or permanent
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const transientPatterns = [
    'econnrefused',
    'econnreset',
    'etimedout',
    'socket hang up',
    'network',
    'timeout',
    'temporarily unavailable',
    'too many connections',
    'connection refused',
    'database',
    'prisma',
    'p1001', // Prisma: Can't reach database
    'p1002', // Prisma: Database timeout
    'p1008', // Prisma: Operations timed out
    'p1017', // Prisma: Server closed connection
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

// GitHub requires GET to return 200 for webhook URL validation
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'GitHub webhook endpoint is active',
    configured: isWebhookVerificationConfigured(),
  });
}
