/**
 * PR Diff Fetcher
 *
 * Fetches and parses PR diff content from GitHub API.
 */

import { getInstallationAccessToken } from './app';

export interface PRDiff {
  content: string;
  files: PRDiffFile[];
  stats: {
    additions: number;
    deletions: number;
    changedFiles: number;
  };
}

export interface PRDiffFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string; // For renamed files
}

// Maximum diff size to prevent context overflow
const MAX_DIFF_SIZE = 100000; // ~100KB

/**
 * Fetch PR files with their diffs
 */
export async function fetchPRDiff(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRDiff> {
  const token = await getInstallationAccessToken(installationId);

  // Fetch PR files with patches
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch PR files: ${response.status} ${error}`);
  }

  const files: Array<{
    sha: string;
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    previous_filename?: string;
  }> = await response.json();

  // Filter out binary files (no patch)
  const textFiles = files.filter((f) => f.patch !== undefined);

  // Calculate stats
  const stats = {
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    changedFiles: files.length,
  };

  // Build unified diff content
  let diffContent = '';
  let currentSize = 0;
  const includedFiles: PRDiffFile[] = [];

  for (const file of textFiles) {
    const fileHeader = `--- a/${file.filename}\n+++ b/${file.filename}\n`;
    const fileDiff = fileHeader + (file.patch || '');

    // Check if adding this file would exceed limit
    if (currentSize + fileDiff.length > MAX_DIFF_SIZE) {
      // Add truncation notice
      diffContent +=
        '\n\n... [DIFF TRUNCATED - Remaining files omitted due to size limit] ...\n';
      diffContent += `Remaining files: ${textFiles.length - includedFiles.length}\n`;
      break;
    }

    diffContent += fileDiff + '\n\n';
    currentSize += fileDiff.length;

    includedFiles.push({
      filename: file.filename,
      status: file.status as PRDiffFile['status'],
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      previousFilename: file.previous_filename,
    });
  }

  return {
    content: diffContent.trim(),
    files: includedFiles,
    stats,
  };
}

/**
 * Check if a PR is too large for full review
 */
export function isLargePR(stats: PRDiff['stats']): boolean {
  return (
    stats.changedFiles > 50 ||
    stats.additions + stats.deletions > 2000
  );
}

/**
 * Get a summary of files for large PRs
 */
export function getFileSummary(files: PRDiffFile[]): string {
  const byStatus = {
    added: files.filter((f) => f.status === 'added'),
    modified: files.filter((f) => f.status === 'modified'),
    removed: files.filter((f) => f.status === 'removed'),
    renamed: files.filter((f) => f.status === 'renamed'),
  };

  let summary = '## Files Changed Summary\n\n';

  if (byStatus.added.length > 0) {
    summary += `### Added (${byStatus.added.length})\n`;
    summary += byStatus.added.map((f) => `- ${f.filename}`).join('\n') + '\n\n';
  }

  if (byStatus.modified.length > 0) {
    summary += `### Modified (${byStatus.modified.length})\n`;
    summary += byStatus.modified.map((f) => `- ${f.filename} (+${f.additions} -${f.deletions})`).join('\n') + '\n\n';
  }

  if (byStatus.removed.length > 0) {
    summary += `### Removed (${byStatus.removed.length})\n`;
    summary += byStatus.removed.map((f) => `- ${f.filename}`).join('\n') + '\n\n';
  }

  if (byStatus.renamed.length > 0) {
    summary += `### Renamed (${byStatus.renamed.length})\n`;
    summary += byStatus.renamed
      .map((f) => `- ${f.previousFilename} -> ${f.filename}`)
      .join('\n') + '\n\n';
  }

  return summary;
}
