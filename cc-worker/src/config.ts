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
  cliPath: z.string().optional().describe('Path to Claude CLI executable (for non-npm installations)'),
  maxConcurrentTasks: z.number().int().min(1).max(5).default(1),
  reconnectInterval: z.number().int().min(1000).default(5000),
  heartbeatInterval: z.number().int().min(5000).default(30000),
  // Orchestration settings
  isOrchestrator: z.boolean().default(false).describe('Whether this worker acts as the orchestrator'),
});

export type WorkerConfig = z.infer<typeof configSchema>;

// Default config file paths
const CONFIG_PATHS = [
  join(process.cwd(), 'cc-worker.config.json'),
  join(process.cwd(), '.cc-worker.json'),
  join(homedir(), '.cc-worker', 'config.json'),
];

function loadConfigFromFile(): { config: Partial<WorkerConfig>; loadedFrom: string | null } {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        console.log(`[Config] Found config file: ${configPath}`);
        return { config: JSON.parse(content), loadedFrom: configPath };
      } catch (error) {
        console.warn(`[Config] Failed to parse config file ${configPath}:`, error);
      }
    } else {
      console.log(`[Config] Config file not found: ${configPath}`);
    }
  }
  console.log('[Config] No config file found, using environment variables only');
  return { config: {}, loadedFrom: null };
}

function loadConfigFromEnv(): Partial<WorkerConfig> {
  return {
    serverUrl: process.env.CC_SERVER_URL,
    apiKey: process.env.CC_API_KEY,
    workerName: process.env.CC_WORKER_NAME,
    workingDirectory: process.env.CC_WORKING_DIR,
    cliPath: process.env.CC_CLI_PATH,
    maxConcurrentTasks: process.env.CC_MAX_CONCURRENT_TASKS
      ? parseInt(process.env.CC_MAX_CONCURRENT_TASKS, 10)
      : undefined,
    reconnectInterval: process.env.CC_RECONNECT_INTERVAL
      ? parseInt(process.env.CC_RECONNECT_INTERVAL, 10)
      : undefined,
    heartbeatInterval: process.env.CC_HEARTBEAT_INTERVAL
      ? parseInt(process.env.CC_HEARTBEAT_INTERVAL, 10)
      : undefined,
    isOrchestrator: process.env.CC_IS_ORCHESTRATOR === 'true',
  };
}

// Mask sensitive values for logging (show first 4 and last 4 chars)
function maskSensitive(value: string | undefined): string {
  if (!value) return '<not set>';
  if (value.length <= 12) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function loadConfig(): WorkerConfig {
  console.log('\n[Config] ═══════════════════════════════════════');
  console.log('[Config] Loading configuration...');
  console.log('[Config] Current working directory:', process.cwd());

  // Merge: file config < env config (env takes priority)
  const { config: fileConfig, loadedFrom } = loadConfigFromFile();
  const envConfig = loadConfigFromEnv();

  // Filter out undefined values before merging
  const cleanEnvConfig = Object.fromEntries(
    Object.entries(envConfig).filter(([_, v]) => v !== undefined)
  );

  const merged = {
    ...fileConfig,
    ...cleanEnvConfig,
  };

  // Log merged config (with sensitive values masked)
  console.log('[Config] ───────────────────────────────────────');
  console.log('[Config] Final configuration:');
  console.log('[Config]   serverUrl:', merged.serverUrl || '<not set>');
  console.log('[Config]   apiKey:', maskSensitive(merged.apiKey as string));
  console.log('[Config]   workerName:', merged.workerName || '<not set>');
  console.log('[Config]   workingDirectory:', merged.workingDirectory || '<not set>');
  console.log('[Config]   cliPath:', merged.cliPath || '<auto-detect>');
  console.log('[Config]   maxConcurrentTasks:', merged.maxConcurrentTasks ?? 1);
  console.log('[Config]   reconnectInterval:', merged.reconnectInterval ?? 5000);
  console.log('[Config]   heartbeatInterval:', merged.heartbeatInterval ?? 30000);
  console.log('[Config]   isOrchestrator:', merged.isOrchestrator ?? false);
  if (loadedFrom) {
    console.log('[Config]   (loaded from file:', loadedFrom + ')');
  }
  if (Object.keys(cleanEnvConfig).length > 0) {
    console.log('[Config]   (env overrides:', Object.keys(cleanEnvConfig).join(', ') + ')');
  }
  console.log('[Config] ═══════════════════════════════════════\n');

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
