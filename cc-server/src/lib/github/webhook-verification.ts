/**
 * GitHub Webhook Signature Verification
 *
 * Verifies that incoming webhooks are actually from GitHub
 * using HMAC-SHA256 signature verification.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

/**
 * Verify the signature of a GitHub webhook payload
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured');
    return false;
  }

  if (!signature) {
    console.warn('[GitHub Webhook] Missing signature header');
    return false;
  }

  // Calculate expected signature
  const expected =
    'sha256=' +
    createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('[GitHub Webhook] Signature verification error:', error);
    return false;
  }
}

/**
 * Check if webhook verification is configured
 */
export function isWebhookVerificationConfigured(): boolean {
  return Boolean(WEBHOOK_SECRET);
}
