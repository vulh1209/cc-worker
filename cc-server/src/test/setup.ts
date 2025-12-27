/**
 * Global test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
});

afterAll(() => {
  // Cleanup after all tests
});

// Global mocks can be defined here
