/**
 * PR Review Completion Handler
 *
 * Handles the completion of PR review tasks by posting comments to GitHub.
 */

import prisma from './prisma';
import { postPRComment, createPRReview } from './github/api-client';
import type { PRReviewResult, PRLineComment } from '@/types';

/**
 * Handle completion of a PR review task
 */
export async function handlePRReviewCompleted(
  taskId: string,
  result: string
): Promise<{ success: boolean; commentUrl?: string; error?: string }> {
  // Find associated PR review
  const prReview = await prisma.gitHubPRReview.findFirst({
    where: { taskId },
    include: {
      repository: {
        include: { installation: true },
      },
    },
  });

  if (!prReview) {
    console.log(`[PR Review Handler] No PR review found for task ${taskId}`);
    return { success: false, error: 'No PR review found' };
  }

  console.log(
    `[PR Review Handler] Processing review for PR #${prReview.prNumber} in ${prReview.repository.fullName}`
  );

  // Update status to IN_PROGRESS
  await prisma.gitHubPRReview.update({
    where: { id: prReview.id },
    data: { status: 'IN_PROGRESS' },
  });

  try {
    // Try to parse as structured JSON first
    let reviewResult: PRReviewResult | null = null;
    let commentBody: string;

    try {
      reviewResult = parseReviewResult(result);
    } catch {
      // If parsing fails, use raw result
    }

    if (reviewResult) {
      // Format structured result as markdown
      commentBody = formatReviewAsMarkdown(reviewResult);

      // If we have line comments, try to create a proper PR review
      if (reviewResult.comments.length > 0) {
        try {
          const review = await createPRReview(
            prReview.repository.installation.installationId,
            prReview.repository.owner,
            prReview.repository.name,
            prReview.prNumber,
            {
              body: commentBody,
              event: mapAssessmentToEvent(reviewResult.overallAssessment),
              comments: reviewResult.comments.map((c) => ({
                path: c.file,
                line: c.line,
                side: c.side,
                body: `${getSeverityIcon(c.severity)} ${c.body}`,
              })),
            }
          );

          await prisma.gitHubPRReview.update({
            where: { id: prReview.id },
            data: {
              status: 'COMPLETED',
              commentId: review.id,
            },
          });

          console.log(`[PR Review Handler] Posted PR review with ${reviewResult.comments.length} comments`);
          return { success: true, commentUrl: review.html_url };
        } catch (error) {
          console.warn('[PR Review Handler] Failed to create PR review, falling back to comment:', error);
          // Fall through to simple comment
        }
      }
    } else {
      // Use raw result as comment body
      commentBody = formatRawResultAsMarkdown(result);
    }

    // Post as issue comment (fallback or when no line comments)
    const comment = await postPRComment(
      prReview.repository.installation.installationId,
      prReview.repository.owner,
      prReview.repository.name,
      prReview.prNumber,
      commentBody
    );

    // Update review status
    await prisma.gitHubPRReview.update({
      where: { id: prReview.id },
      data: {
        status: 'COMPLETED',
        commentId: comment.id,
      },
    });

    console.log(`[PR Review Handler] Posted comment for PR #${prReview.prNumber}`);
    return { success: true, commentUrl: comment.html_url };
  } catch (error) {
    console.error('[PR Review Handler] Failed to post comment:', error);

    // Update review status to failed
    await prisma.gitHubPRReview.update({
      where: { id: prReview.id },
      data: { status: 'FAILED' },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle failure of a PR review task
 */
export async function handlePRReviewFailed(
  taskId: string,
  error: string
): Promise<void> {
  const prReview = await prisma.gitHubPRReview.findFirst({
    where: { taskId },
  });

  if (prReview) {
    await prisma.gitHubPRReview.update({
      where: { id: prReview.id },
      data: { status: 'FAILED' },
    });

    console.log(`[PR Review Handler] Marked review as failed for task ${taskId}: ${error}`);
  }
}

/**
 * Parse review result from task result string
 */
function parseReviewResult(result: string): PRReviewResult | null {
  try {
    let jsonStr = result.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.summary || !parsed.overallAssessment) {
      return null;
    }

    return parsed as PRReviewResult;
  } catch {
    return null;
  }
}

/**
 * Format structured review result as markdown
 */
function formatReviewAsMarkdown(result: PRReviewResult): string {
  const assessmentEmoji = {
    approve: ':white_check_mark:',
    request_changes: ':x:',
    comment: ':speech_balloon:',
  }[result.overallAssessment];

  const riskEmoji = {
    low: ':green_circle:',
    medium: ':yellow_circle:',
    high: ':red_circle:',
  }[result.riskLevel];

  let markdown = `## ${assessmentEmoji} Code Review

${result.overallComment}

### Summary
${result.summary}

### Risk Level: ${riskEmoji} ${result.riskLevel.toUpperCase()}

### Category Scores

| Category | Score | Issues |
|----------|-------|--------|
| Security | ${'⭐'.repeat(result.categories.security.score)} | ${result.categories.security.issues.length} |
| Performance | ${'⭐'.repeat(result.categories.performance.score)} | ${result.categories.performance.issues.length} |
| Code Quality | ${'⭐'.repeat(result.categories.codeQuality.score)} | ${result.categories.codeQuality.issues.length} |
| Test Coverage | ${'⭐'.repeat(result.categories.testCoverage.score)} | ${result.categories.testCoverage.issues.length} |

`;

  // Add issues if any
  const allIssues = [
    ...result.categories.security.issues.map((i) => `🔒 ${i}`),
    ...result.categories.performance.issues.map((i) => `⚡ ${i}`),
    ...result.categories.codeQuality.issues.map((i) => `📝 ${i}`),
    ...result.categories.testCoverage.issues.map((i) => `🧪 ${i}`),
  ];

  if (allIssues.length > 0) {
    markdown += `### Issues Found\n\n${allIssues.map((i) => `- ${i}`).join('\n')}\n\n`;
  }

  // Add suggestions
  if (result.suggestions.length > 0) {
    markdown += `### Suggestions\n\n${result.suggestions.map((s) => `- ${s}`).join('\n')}\n\n`;
  }

  markdown += `\n---\n<sub>🤖 Powered by CC-Worker with Claude</sub>`;

  return markdown;
}

/**
 * Format raw result as markdown (fallback)
 */
function formatRawResultAsMarkdown(result: string): string {
  return `## 🤖 Code Review

${result}

---
<sub>Powered by CC-Worker with Claude</sub>`;
}

/**
 * Map assessment to GitHub review event
 */
function mapAssessmentToEvent(
  assessment: 'approve' | 'request_changes' | 'comment'
): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
  return {
    approve: 'APPROVE' as const,
    request_changes: 'REQUEST_CHANGES' as const,
    comment: 'COMMENT' as const,
  }[assessment];
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity: PRLineComment['severity']): string {
  return {
    suggestion: '💡',
    warning: '⚠️',
    blocker: '🚫',
  }[severity];
}
