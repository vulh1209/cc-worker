import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import 'dotenv/config';

// Configuration schema with Zod for type-safe validation
// Note: Claude Code SDK uses CLI subscription authentication (run `claude login` first)
// No ANTHROPIC_API_KEY needed - the SDK automatically uses your CLI session
const configSchema = z.object({
  serverUrl: z.string().url().describe('WebSocket server URL'),
  apiKey: z.string().min(1).describe('Worker API key for authentication'),
  workerName: z.string().min(1).describe('Human-readable worker name'),
  workingDirectory: z.string().min(1).describe('Directory for Claude to work in'),
  maxConcurrentTasks: z.number().int().min(1).max(5).default(1),
  reconnectInterval: z.number().int().min(1000).default(5000),
  heartbeatInterval: z.number().int().min(5000).default(30000),
});

export type WorkerConfig = z.infer<typeof configSchema>;

// Default config file paths
const CONFIG_PATHS = [
  join(process.cwd(), 'cc-worker.config.json'),
  join(process.cwd(), '.cc-worker.json'),
  join(homedir(), '.cc-worker', 'config.json'),
];

function loadConfigFromFile(): Partial<WorkerConfig> {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to parse config file ${configPath}:`, error);
      }
    }
  }
  return {};
}

function loadConfigFromEnv(): Partial<WorkerConfig> {
  return {
    serverUrl: process.env.CC_SERVER_URL,
    apiKey: process.env.CC_API_KEY,
    workerName: process.env.CC_WORKER_NAME,
    workingDirectory: process.env.CC_WORKING_DIR,
    maxConcurrentTasks: process.env.CC_MAX_CONCURRENT_TASKS
      ? parseInt(process.env.CC_MAX_CONCURRENT_TASKS, 10)
      : undefined,
    reconnectInterval: process.env.CC_RECONNECT_INTERVAL
      ? parseInt(process.env.CC_RECONNECT_INTERVAL, 10)
      : undefined,
    heartbeatInterval: process.env.CC_HEARTBEAT_INTERVAL
      ? parseInt(process.env.CC_HEARTBEAT_INTERVAL, 10)
      : undefined,
  };
}

export function loadConfig(): WorkerConfig {
  // Merge: file config < env config (env takes priority)
  const fileConfig = loadConfigFromFile();
  const envConfig = loadConfigFromEnv();

  // Filter out undefined values before merging
  const cleanEnvConfig = Object.fromEntries(
    Object.entries(envConfig).filter(([_, v]) => v !== undefined)
  );

  const merged = {
    ...fileConfig,
    ...cleanEnvConfig,
  };

  // Validate with Zod
  const result = configSchema.safeParse(merged);

  if (!result.success) {
    console.error('Configuration validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\nPlease check your configuration file or environment variables.');
    console.error('Config file locations checked:', CONFIG_PATHS.join(', '));
    process.exit(1);
  }

  return result.data;
}

// Export singleton config (lazy-loaded)
let cachedConfig: WorkerConfig | null = null;

export function getConfig(): WorkerConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
