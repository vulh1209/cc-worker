/**
 * Tests for utility functions in lib/utils.ts
 *
 * Testing current behavior to establish a safety net before refactoring.
 * Focus: API key handling, time formatting, and string utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  getApiKeyPreview,
  formatRelativeTime,
  formatDuration,
  truncate,
} from '../utils';

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate an API key with worker_ prefix', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^worker_/);
    });

    it('should generate keys of consistent length', () => {
      const apiKey1 = generateApiKey();
      const apiKey2 = generateApiKey();
      expect(apiKey1.length).toBe(apiKey2.length);
    });

    it('should generate unique keys on multiple calls', () => {
      const apiKey1 = generateApiKey();
      const apiKey2 = generateApiKey();
      const apiKey3 = generateApiKey();

      expect(apiKey1).not.toBe(apiKey2);
      expect(apiKey2).not.toBe(apiKey3);
      expect(apiKey1).not.toBe(apiKey3);
    });

    it('should generate keys with base64url-safe characters', () => {
      const apiKey = generateApiKey();
      const keyPart = apiKey.replace('worker_', '');

      // base64url uses: A-Z, a-z, 0-9, -, _
      expect(keyPart).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should generate keys longer than 15 characters (for preview)', () => {
      const apiKey = generateApiKey();
      expect(apiKey.length).toBeGreaterThan(15);
    });
  });

  describe('hashApiKey', () => {
    it('should generate a SHA-256 hash', () => {
      const hash = hashApiKey('worker_test123');

      // SHA-256 produces 64 character hex string
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate consistent hashes for same input', () => {
      const apiKey = 'worker_test123';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = hashApiKey('worker_test123');
      const hash2 = hashApiKey('worker_test456');

      expect(hash1).not.toBe(hash2);
    });

    it('should be case-sensitive', () => {
      const hash1 = hashApiKey('worker_ABC');
      const hash2 = hashApiKey('worker_abc');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify a correct API key against its hash', () => {
      const apiKey = 'worker_test123';
      const hash = hashApiKey(apiKey);

      expect(verifyApiKey(apiKey, hash)).toBe(true);
    });

    it('should reject an incorrect API key', () => {
      const apiKey = 'worker_test123';
      const wrongKey = 'worker_wrong456';
      const hash = hashApiKey(apiKey);

      expect(verifyApiKey(wrongKey, hash)).toBe(false);
    });

    it('should reject empty string', () => {
      const apiKey = 'worker_test123';
      const hash = hashApiKey(apiKey);

      expect(verifyApiKey('', hash)).toBe(false);
    });

    it('should verify generated API keys', () => {
      const apiKey = generateApiKey();
      const hash = hashApiKey(apiKey);

      expect(verifyApiKey(apiKey, hash)).toBe(true);
    });
  });

  describe('getApiKeyPreview', () => {
    it('should return first 15 characters plus ellipsis', () => {
      const apiKey = 'worker_1234567890ABCDEFGHIJKLMNO';
      const preview = getApiKeyPreview(apiKey);

      expect(preview).toBe('worker_12345678...');
      expect(preview.length).toBe(18); // 15 chars + '...'
    });

    it('should work with generated API keys', () => {
      const apiKey = generateApiKey();
      const preview = getApiKeyPreview(apiKey);

      expect(preview).toMatch(/^worker_/);
      expect(preview.endsWith('...')).toBe(true);
      expect(preview.length).toBe(18);
    });

    it('should handle API key exactly 15 characters', () => {
      const apiKey = 'worker_12345678'; // exactly 15 chars
      const preview = getApiKeyPreview(apiKey);

      expect(preview).toBe('worker_12345678...');
    });

    it('should handle API key shorter than 15 characters', () => {
      const apiKey = 'worker_123'; // 10 chars
      const preview = getApiKeyPreview(apiKey);

      expect(preview).toBe('worker_123...');
    });

    it('should handle empty string', () => {
      const preview = getApiKeyPreview('');

      expect(preview).toBe('...');
    });

    it('should never return the full API key', () => {
      const apiKeys = [
        generateApiKey(),
        generateApiKey(),
        'worker_' + 'x'.repeat(50),
      ];

      apiKeys.forEach(key => {
        const preview = getApiKeyPreview(key);
        expect(preview).not.toBe(key);
        if (key.length > 15) {
          expect(preview.length).toBeLessThan(key.length);
        }
      });
    });

    it('should be consistent for same input', () => {
      const apiKey = generateApiKey();
      const preview1 = getApiKeyPreview(apiKey);
      const preview2 = getApiKeyPreview(apiKey);

      expect(preview1).toBe(preview2);
    });

    it('should differentiate between different keys', () => {
      const key1 = 'worker_aaaaaaaa';
      const key2 = 'worker_bbbbbbbb';

      const preview1 = getApiKeyPreview(key1);
      const preview2 = getApiKeyPreview(key2);

      expect(preview1).not.toBe(preview2);
    });

    it('should match the legacy substring(0, 15) + "..." pattern', () => {
      const testKeys = [
        'worker_1234567890ABCDEFGHIJKLMNO',
        generateApiKey(),
        'worker_test',
        'worker_' + 'x'.repeat(100),
      ];

      testKeys.forEach(key => {
        const newPreview = getApiKeyPreview(key);
        const legacyPreview = key.substring(0, 15) + '...';

        expect(newPreview).toBe(legacyPreview);
      });
    });
  });
});

describe('Time Formatting Utilities', () => {
  describe('formatRelativeTime', () => {
    it('should return "Never" for null date', () => {
      expect(formatRelativeTime(null)).toBe('Never');
    });

    it('should return "Just now" for recent timestamps (< 60 seconds)', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);

      expect(formatRelativeTime(thirtySecondsAgo)).toBe('Just now');
    });

    it('should return minutes for timestamps < 60 minutes', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 min ago');
    });

    it('should return hours for timestamps < 24 hours', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
    });

    it('should return days for timestamps >= 24 hours', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    });

    it('should handle edge case: exactly 60 seconds', () => {
      const now = new Date();
      const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);

      expect(formatRelativeTime(sixtySecondsAgo)).toBe('1 min ago');
    });

    it('should handle edge case: exactly 60 minutes', () => {
      const now = new Date();
      const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

      expect(formatRelativeTime(sixtyMinutesAgo)).toBe('1 hours ago');
    });

    it('should handle edge case: exactly 24 hours', () => {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      expect(formatRelativeTime(twentyFourHoursAgo)).toBe('1 days ago');
    });
  });

  describe('formatDuration', () => {
    it('should return "-" for null duration', () => {
      expect(formatDuration(null)).toBe('-');
    });

    it('should format milliseconds (< 1 second)', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds (< 60 seconds)', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes and seconds (< 60 minutes)', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(125000)).toBe('2m 5s');
      expect(formatDuration(3599000)).toBe('59m 59s');
    });

    it('should format hours and minutes (>= 60 minutes)', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(7325000)).toBe('2h 2m');
      expect(formatDuration(86400000)).toBe('24h 0m');
    });

    it('should handle edge case: exactly 1 second', () => {
      expect(formatDuration(1000)).toBe('1.0s');
    });

    it('should handle edge case: 0 milliseconds', () => {
      // Note: formatDuration treats 0 as falsy, returns "-"
      expect(formatDuration(0)).toBe('-');
    });
  });
});

describe('String Utilities', () => {
  describe('truncate', () => {
    it('should not truncate strings shorter than maxLength', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should not truncate strings exactly at maxLength', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });

    it('should truncate strings longer than maxLength', () => {
      const longString = 'This is a very long string that needs truncation';
      const result = truncate(longString, 20);

      expect(result).toBe('This is a very lo...');
      expect(result.length).toBe(20);
    });

    it('should add ellipsis to truncated strings', () => {
      expect(truncate('hello world', 8)).toContain('...');
    });

    it('should account for ellipsis in maxLength (maxLength - 3 chars + "...")', () => {
      const result = truncate('0123456789', 7);

      expect(result).toBe('0123...');
      expect(result.length).toBe(7);
    });

    it('should handle very short maxLength', () => {
      expect(truncate('hello', 3)).toBe('...');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('should handle maxLength of 0', () => {
      expect(truncate('hello', 0)).toBe('...');
    });
  });
});

describe('API Key Preview Behavior (Current Implementation)', () => {
  /**
   * These tests document the CURRENT behavior of API key preview
   * before we extract it into a dedicated utility function.
   *
   * Current implementation: apiKey.substring(0, 15) + '...'
   * Locations:
   * - src/app/api/workers/[id]/route.ts:49
   * - src/app/workers/[id]/page.tsx:170
   */
  describe('substring(0, 15) + "..." pattern', () => {
    it('should create preview from typical generated API key', () => {
      const apiKey = generateApiKey(); // e.g., "worker_XXXXXXXXXXXXXXXXXXXXXXXX"
      const preview = apiKey.substring(0, 15) + '...';

      expect(preview.length).toBe(18); // 15 chars + "..."
      expect(preview.startsWith('worker_')).toBe(true);
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should handle key exactly 15 characters', () => {
      const apiKey = 'worker_12345678'; // exactly 15 chars
      const preview = apiKey.substring(0, 15) + '...';

      expect(preview).toBe('worker_12345678...');
    });

    it('should handle key shorter than 15 characters', () => {
      const apiKey = 'worker_123'; // 10 chars
      const preview = apiKey.substring(0, 15) + '...';

      expect(preview).toBe('worker_123...');
    });

    it('should handle empty string edge case', () => {
      const apiKey = '';
      const preview = apiKey.substring(0, 15) + '...';

      expect(preview).toBe('...');
    });

    it('should show prefix "worker_" in preview', () => {
      const apiKeys = [
        generateApiKey(),
        generateApiKey(),
        generateApiKey(),
      ];

      apiKeys.forEach(key => {
        const preview = key.substring(0, 15) + '...';
        expect(preview).toMatch(/^worker_/);
      });
    });

    it('should be consistent for same API key', () => {
      const apiKey = generateApiKey();
      const preview1 = apiKey.substring(0, 15) + '...';
      const preview2 = apiKey.substring(0, 15) + '...';

      expect(preview1).toBe(preview2);
    });

    it('should differentiate between different API keys (when possible)', () => {
      // Note: If two keys share the same first 15 characters, previews will be identical
      // This test verifies that different keys CAN produce different previews
      const key1 = 'worker_aaaaaaaa';
      const key2 = 'worker_bbbbbbbb';

      const preview1 = key1.substring(0, 15) + '...';
      const preview2 = key2.substring(0, 15) + '...';

      expect(preview1).not.toBe(preview2);
    });

    it('should not expose the full API key', () => {
      const apiKey = generateApiKey();
      const preview = apiKey.substring(0, 15) + '...';

      expect(preview).not.toBe(apiKey);
      expect(apiKey).toContain(preview.replace('...', ''));
    });
  });

  describe('Security: Full key should never equal preview', () => {
    it('should never return the full key as preview', () => {
      const apiKeys = [
        generateApiKey(),
        generateApiKey(),
        generateApiKey(),
        'worker_' + 'x'.repeat(50), // long key
      ];

      apiKeys.forEach(key => {
        const preview = key.substring(0, 15) + '...';
        expect(preview).not.toBe(key);
        expect(preview.length).toBeLessThan(key.length);
      });
    });
  });
});
