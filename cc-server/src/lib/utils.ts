import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createHash, randomBytes } from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate a secure API key
export function generateApiKey(): string {
  const prefix = 'worker_';
  const randomPart = randomBytes(24).toString('base64url');
  return `${prefix}${randomPart}`;
}

// Hash an API key for storage
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// Verify an API key against its hash
export function verifyApiKey(apiKey: string, hash: string): boolean {
  return hashApiKey(apiKey) === hash;
}

// API key preview configuration
const API_KEY_PREVIEW_LENGTH = 15;

// Get a preview of an API key (first 15 characters + "...")
// Used to display API keys securely without exposing the full key
export function getApiKeyPreview(apiKey: string): string {
  return apiKey.substring(0, API_KEY_PREVIEW_LENGTH) + '...';
}

// Format relative time
export function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hours ago`;
  return `${diffDay} days ago`;
}

// Format duration in milliseconds
export function formatDuration(ms: number | null): string {
  if (!ms) return '-';

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// Truncate string
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
