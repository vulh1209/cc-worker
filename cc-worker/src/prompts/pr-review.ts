/**
 * PR Review Prompt Generator
 *
 * Generates specialized prompts for PR review tasks and parses the responses.
 */

import type { PRReviewContext, PRReviewResult } from '../types/index.js';

export interface PRReviewPromptOptions {
  context: PRReviewContext;
  focusAreas?: ('security' | 'performance' | 'style' | 'logic' | 'tests')[];
  maxComments?: number;
  includeLineComments?: boolean;
}

/**
 * Generate a structured PR review prompt for Claude
 */
export function generatePRReviewPrompt(options: PRReviewPromptOptions): string {
  const {
    context,
    focusAreas = [],
    maxComments = 20,
    includeLineComments = true,
  } = options;

  const { pullRequest, repository, files, diff } = context;

  const focusInstructions =
    focusAreas.length > 0
      ? `Focus your review on: ${focusAreas.join(', ')}.`
      : 'Provide a comprehensive review covering security, performance, style, and logic.';

  return `# Pull Request Code Review

You are a senior software engineer performing a thorough code review. Review the following pull request and provide constructive, actionable feedback.

## Repository
- **Name**: ${repository.owner}/${repository.name}
- **Default Branch**: ${repository.defaultBranch}

## Pull Request Details
- **Title**: ${pullRequest.title}
- **Author**: ${pullRequest.author}
- **Branch**: ${pullRequest.headBranch} -> ${pullRequest.baseBranch}
- **PR Number**: #${pullRequest.number}
- **URL**: ${pullRequest.url}

## Description
${pullRequest.description || 'No description provided.'}

## Files Changed (${files.length} files)
${files.map((f) => `- ${f.status.toUpperCase()} ${f.filename} (+${f.additions} -${f.deletions})`).join('\n')}

## Diff
\`\`\`diff
${diff}
\`\`\`

## Review Guidelines
${focusInstructions}
${context.reviewGuidelines || ''}

## Your Response Format

Respond with ONLY a JSON object (no markdown wrapping):

{
  "summary": "Brief 1-2 sentence summary of the changes",
  "overallAssessment": "approve" | "request_changes" | "comment",
  "overallComment": "General feedback on the PR (2-4 sentences)",
  "riskLevel": "low" | "medium" | "high",
  "categories": {
    "security": { "score": 1-5, "issues": ["issue1", "issue2"] },
    "performance": { "score": 1-5, "issues": [] },
    "codeQuality": { "score": 1-5, "issues": [] },
    "testCoverage": { "score": 1-5, "issues": [] }
  },
  ${
    includeLineComments
      ? `"comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "Specific feedback for this line",
      "severity": "suggestion" | "warning" | "blocker"
    }
  ],`
      : '"comments": [],'
  }
  "suggestions": [
    "High-level improvement suggestion 1",
    "High-level improvement suggestion 2"
  ]
}

Guidelines for your review:
- Maximum ${maxComments} line-specific comments
- Be constructive and specific in feedback
- Prioritize critical issues over nitpicks
- Suggest improvements, don't just criticize
- Consider the context and purpose of changes
- Identify potential bugs, security issues, and edge cases

Respond with the JSON only:`;
}

/**
 * Parse Claude's PR review response into structured format
 */
export function parsePRReviewResponse(response: string): PRReviewResult | null {
  try {
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object in the response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.summary || !parsed.overallAssessment) {
      console.error('[PRReview] Missing required fields in response');
      return null;
    }

    // Validate overallAssessment
    if (!['approve', 'request_changes', 'comment'].includes(parsed.overallAssessment)) {
      console.error(`[PRReview] Invalid overallAssessment: ${parsed.overallAssessment}`);
      parsed.overallAssessment = 'comment'; // Default to comment
    }

    // Ensure comments is an array
    if (!Array.isArray(parsed.comments)) {
      parsed.comments = [];
    }

    // Ensure suggestions is an array
    if (!Array.isArray(parsed.suggestions)) {
      parsed.suggestions = [];
    }

    // Provide defaults for categories if missing
    if (!parsed.categories) {
      parsed.categories = {
        security: { score: 3, issues: [] },
        performance: { score: 3, issues: [] },
        codeQuality: { score: 3, issues: [] },
        testCoverage: { score: 3, issues: [] },
      };
    }

    return parsed as PRReviewResult;
  } catch (error) {
    console.error('[PRReview] Failed to parse response:', error);
    console.error('[PRReview] Response was:', response.substring(0, 500));
    return null;
  }
}

/**
 * Format PR review result as a markdown comment for GitHub
 */
export function formatReviewAsMarkdown(result: PRReviewResult): string {
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

  // Add line comments summary
  if (result.comments.length > 0) {
    markdown += `### Inline Comments\n\n`;
    markdown += `Found ${result.comments.length} specific issues:\n\n`;
    result.comments.slice(0, 5).forEach((c) => {
      const severityIcon = {
        suggestion: '💡',
        warning: '⚠️',
        blocker: '🚫',
      }[c.severity];
      markdown += `- ${severityIcon} **${c.file}:${c.line}** - ${c.body.substring(0, 100)}${c.body.length > 100 ? '...' : ''}\n`;
    });
    if (result.comments.length > 5) {
      markdown += `\n*...and ${result.comments.length - 5} more comments*\n`;
    }
  }

  markdown += `\n---\n<sub>Powered by [CC-Worker](https://github.com/your-org/cc-worker) with Claude</sub>`;

  return markdown;
}
