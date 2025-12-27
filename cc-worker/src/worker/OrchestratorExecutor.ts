import { query, type SDKMessage, type SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { WorkerConfig } from '../config.js';
import type { OrchestrationDecision, WorkerRoutingInfo } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { generateOrchestrationPrompt, parseOrchestrationResponse } from '../prompts/orchestration.js';

// Content block types
type TextBlock = { type: 'text'; text: string };
type ContentBlock = TextBlock | { type: string };

export interface OrchestrationResult {
  success: boolean;
  decision?: OrchestrationDecision;
  error?: string;
  duration: number;
}

export class OrchestratorExecutor {
  private config: WorkerConfig;
  private abortController: AbortController | null = null;
  private currentTaskId: string | null = null;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  /**
   * Analyze a task and return an orchestration decision
   */
  async analyze(
    taskId: string,
    prompt: string,
    priority: number,
    orchestrationDepth: number,
    availableWorkers: WorkerRoutingInfo[]
  ): Promise<OrchestrationResult> {
    this.currentTaskId = taskId;
    this.abortController = new AbortController();

    const startTime = Date.now();

    logger.info(`[Orchestrator] Analyzing task ${taskId}`);
    logger.info(`[Orchestrator] Available workers: ${availableWorkers.length}`);
    logger.info(`[Orchestrator] Orchestration depth: ${orchestrationDepth}`);

    try {
      // Generate orchestration prompt
      const orchestrationPrompt = generateOrchestrationPrompt({
        taskId,
        prompt,
        priority,
        orchestrationDepth,
        availableWorkers,
      });

      // Get working directory
      let cwd = this.config.workingDirectory;
      if (process.platform === 'win32' && cwd.includes('/')) {
        cwd = cwd.replace(/\//g, '\\');
      }

      // Execute Claude query for orchestration analysis
      let fullResponse = '';

      for await (const message of query({
        prompt: orchestrationPrompt,
        options: {
          abortController: this.abortController,
          allowedTools: [], // No tools needed for orchestration analysis
          cwd,
          maxTurns: 1, // Single turn for analysis
          dangerouslySkipPermissions: true, // Skip permission prompts for headless worker execution
          ...(this.config.cliPath && { pathToClaudeCodeExecutable: this.config.cliPath }),
        },
      })) {
        if (this.abortController.signal.aborted) {
          throw new Error('Orchestration cancelled');
        }

        // Extract text from assistant messages
        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          if (assistantMsg.message?.content) {
            for (const block of assistantMsg.message.content as ContentBlock[]) {
              if (block.type === 'text') {
                fullResponse += (block as TextBlock).text;
              }
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      // Parse the response
      const decision = parseOrchestrationResponse(fullResponse);

      if (!decision) {
        logger.error(`[Orchestrator] Failed to parse decision for task ${taskId}`);
        // Default to routing to any available worker
        return {
          success: true,
          decision: {
            action: 'route',
            targetWorkerId: availableWorkers.length > 0 ? availableWorkers[0].id : undefined,
            reasoning: 'Fallback: could not parse orchestration response',
          },
          duration,
        };
      }

      logger.info(`[Orchestrator] Decision for task ${taskId}: ${decision.action} - ${decision.reasoning}`);

      return {
        success: true,
        decision,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[Orchestrator] Error analyzing task ${taskId}: ${errorMessage}`);

      // On error, fallback to simple routing
      return {
        success: false,
        error: errorMessage,
        decision: {
          action: 'route',
          targetWorkerId: availableWorkers.length > 0 ? availableWorkers[0].id : undefined,
          reasoning: `Fallback due to error: ${errorMessage}`,
        },
        duration,
      };
    } finally {
      this.abortController = null;
      this.currentTaskId = null;
    }
  }

  cancel(): boolean {
    if (this.abortController && this.currentTaskId) {
      logger.info(`[Orchestrator] Cancelling analysis: ${this.currentTaskId}`);
      this.abortController.abort();
      return true;
    }
    return false;
  }

  get isAnalyzing(): boolean {
    return this.currentTaskId !== null;
  }

  get currentTask(): string | null {
    return this.currentTaskId;
  }
}
