#!/usr/bin/env node

import { loadConfig } from './config.js';
import { WorkerClient } from './worker/WorkerClient.js';
import { logger } from './utils/logger.js';
import { initAutoUpdater } from './utils/auto-updater.js';

const VERSION = '1.0.0';

async function main(): Promise<void> {
  try {
    // Load configuration
    logger.info('Loading configuration...');
    const config = loadConfig();

    // Initialize auto-updater (if update server URL is configured)
    if (process.env.CC_UPDATE_URL) {
      initAutoUpdater({
        checkUrl: process.env.CC_UPDATE_URL,
        currentVersion: VERSION,
        checkInterval: 60 * 60 * 1000, // Check every hour
      });
    }

    // Create and start worker
    const worker = new WorkerClient(config);
    await worker.start();
  } catch (error) {
    logger.error('Failed to start CC-Worker:', error);
    process.exit(1);
  }
}

main();
