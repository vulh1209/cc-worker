import { query, type SDKMessage, type SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import { logger } from '../utils/logger.js';
import type {
  Workflow,
  WorkflowStep,
  WorkflowStepResult,
  WorkflowExecutionResult,
  WorkflowExecutionStatus,
  WorkflowVariables,
  WorkflowModel,
} from '../types/index.js';

// Content block types from Anthropic SDK
type TextBlock = { type: 'text'; text: string };
type ContentBlock = TextBlock | { type: string };

/**
 * Options for workflow execution
 */
export interface WorkflowRunnerOptions {
  /** Working directory for Claude Code execution */
  workingDirectory: string;
  /** Path to Claude CLI executable (optional) */
  cliPath?: string;
  /** Maximum retries per step (default: 2) */
  maxRetriesPerStep?: number;
  /** Callback for step progress updates */
  onStepProgress?: (stepIndex: number, stepName: string, status: 'started' | 'completed' | 'failed') => void;
  /** Callback for logging */
  onLog?: (type: 'SYSTEM' | 'ERROR', message: string) => void;
}

/**
 * WorkflowRunner executes multi-step workflows with context preservation.
 *
 * Inspired by NightShift's workflow system, this enables:
 * - Sequential step execution with context preservation
 * - Variable substitution in prompts
 * - Conditional branching (skip, retry, jump)
 * - Per-step model selection
 */
export class WorkflowRunner {
  private options: Required<Omit<WorkflowRunnerOptions, 'cliPath'>> & { cliPath?: string };
  private abortController: AbortController | null = null;

  constructor(options: WorkflowRunnerOptions) {
    this.options = {
      workingDirectory: options.workingDirectory,
      cliPath: options.cliPath,
      maxRetriesPerStep: options.maxRetriesPerStep ?? 2,
      onStepProgress: options.onStepProgress ?? (() => {}),
      onLog: options.onLog ?? (() => {}),
    };
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflow: Workflow,
    variables?: WorkflowVariables,
    startFromStep: number = 0
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const stepResults: WorkflowStepResult[] = [];
    let sessionId: string | undefined;
    let status: WorkflowExecutionStatus = 'RUNNING';

    this.abortController = new AbortController();

    this.log('SYSTEM', `Starting workflow: ${workflow.name} (${workflow.steps.length} steps)`);

    try {
      let stepIndex = startFromStep;

      while (stepIndex < workflow.steps.length) {
        // Check if cancelled
        if (this.abortController.signal.aborted) {
          status = 'CANCELLED';
          break;
        }

        const step = workflow.steps[stepIndex];
        const stepStartTime = Date.now();

        this.options.onStepProgress(stepIndex, step.name, 'started');
        this.log('SYSTEM', `Step ${stepIndex + 1}/${workflow.steps.length}: ${step.name}`);

        // Substitute variables in prompt
        const prompt = this.substituteVariables(step.prompt, variables);

        // Determine if we should continue from previous session
        const useSession = step.continueFromPrevious && sessionId;

        let retryCount = 0;
        const maxRetries = step.conditions?.maxRetries ?? this.options.maxRetriesPerStep;
        let stepResult: WorkflowStepResult | null = null;

        while (retryCount <= maxRetries) {
          try {
            // Execute the step
            const result = await this.executeStep(
              prompt,
              step,
              workflow.defaultModel,
              useSession ? sessionId : undefined
            );

            // Update session ID for context preservation
            sessionId = result.sessionId;

            stepResult = {
              stepIndex,
              stepName: step.name,
              status: 'completed',
              result: result.output,
              duration: Date.now() - stepStartTime,
            };

            this.options.onStepProgress(stepIndex, step.name, 'completed');
            break; // Success, exit retry loop

          } catch (error) {
            retryCount++;
            const errorMsg = error instanceof Error ? error.message : String(error);

            if (step.conditions?.onFailure === 'retry' && retryCount <= maxRetries) {
              this.log('SYSTEM', `Step ${step.name} failed, retrying (${retryCount}/${maxRetries}): ${errorMsg}`);
              continue;
            }

            // Handle failure
            stepResult = {
              stepIndex,
              stepName: step.name,
              status: 'failed',
              error: errorMsg,
              duration: Date.now() - stepStartTime,
            };

            this.options.onStepProgress(stepIndex, step.name, 'failed');
            break;
          }
        }

        if (stepResult) {
          stepResults.push(stepResult);

          // Handle step result conditions
          const nextStep = this.getNextStep(stepIndex, stepResult, step, workflow.steps.length);

          if (nextStep === 'end') {
            break;
          } else if (nextStep === 'fail') {
            status = 'FAILED';
            break;
          } else if (nextStep === 'skip') {
            stepIndex++;
            continue;
          } else {
            stepIndex = nextStep;
          }
        } else {
          // Should not reach here
          stepIndex++;
        }
      }

      // Determine final status
      if (status === 'RUNNING') {
        const hasFailures = stepResults.some(r => r.status === 'failed');
        status = hasFailures ? 'FAILED' : 'COMPLETED';
      }

      const totalDuration = Date.now() - startTime;
      this.log('SYSTEM', `Workflow ${workflow.name} ${status.toLowerCase()} in ${totalDuration}ms`);

      return {
        success: status === 'COMPLETED',
        status,
        stepResults,
        totalDuration,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('ERROR', `Workflow failed: ${errorMsg}`);

      return {
        success: false,
        status: 'FAILED',
        stepResults,
        totalDuration: Date.now() - startTime,
        error: errorMsg,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel the current workflow execution
   */
  cancel(): boolean {
    if (this.abortController) {
      this.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    prompt: string,
    step: WorkflowStep,
    defaultModel?: WorkflowModel,
    sessionId?: string
  ): Promise<{ output: string; sessionId?: string }> {
    const model = step.model || defaultModel || 'sonnet';

    // Prepare query options
    const queryOptions: Parameters<typeof query>[0]['options'] = {
      abortController: this.abortController ?? undefined,
      cwd: this.options.workingDirectory,
      maxTurns: step.maxTurns ?? 50,
      dangerouslySkipPermissions: true,
      ...(this.options.cliPath && { pathToClaudeCodeExecutable: this.options.cliPath }),
    };

    // Add allowed tools if specified
    if (step.allowedTools && step.allowedTools.length > 0) {
      queryOptions.allowedTools = step.allowedTools;
    }

    // Resume from session if provided
    if (sessionId) {
      queryOptions.resume = sessionId;
    }

    let capturedSessionId: string | undefined;
    let finalResult = '';

    // Execute Claude query with streaming
    for await (const message of query({
      prompt,
      options: queryOptions,
    })) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw new Error('Workflow cancelled');
      }

      // Capture session_id from messages
      if ('session_id' in message && message.session_id) {
        capturedSessionId = message.session_id as string;
      }

      // Capture final result from assistant messages
      if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage;
        if (assistantMsg.message?.content) {
          const textContent = this.extractTextContent(assistantMsg.message.content as ContentBlock[]);
          if (textContent) {
            finalResult = textContent;
          }
        }
      }
    }

    return {
      output: finalResult,
      sessionId: capturedSessionId,
    };
  }

  /**
   * Extract text content from content blocks
   */
  private extractTextContent(content: ContentBlock[]): string {
    return content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  /**
   * Determine the next step based on conditions
   */
  private getNextStep(
    currentIndex: number,
    result: WorkflowStepResult,
    step: WorkflowStep,
    _totalSteps: number
  ): number | 'end' | 'fail' | 'skip' {
    const conditions = step.conditions;

    if (result.status === 'completed') {
      // Handle success condition
      const onSuccess = conditions?.onSuccess ?? 'continue';

      if (onSuccess === 'continue') {
        return currentIndex + 1;
      } else if (onSuccess === 'skip_to_end') {
        return 'end';
      } else if (typeof onSuccess === 'number') {
        return onSuccess;
      }
    } else if (result.status === 'failed') {
      // Handle failure condition
      const onFailure = conditions?.onFailure ?? 'fail';

      if (onFailure === 'fail') {
        return 'fail';
      } else if (onFailure === 'skip') {
        return currentIndex + 1;
      } else if (typeof onFailure === 'number') {
        return onFailure;
      }
      // 'retry' is handled in the main loop
    }

    // Default: continue to next
    return currentIndex + 1;
  }

  /**
   * Substitute variables in prompt template
   */
  private substituteVariables(template: string, variables?: WorkflowVariables): string {
    if (!variables) return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Log a message
   */
  private log(type: 'SYSTEM' | 'ERROR', message: string): void {
    this.options.onLog(type, message);

    if (type === 'ERROR') {
      logger.error(`[WorkflowRunner] ${message}`);
    } else {
      logger.info(`[WorkflowRunner] ${message}`);
    }
  }
}

/**
 * Create a WorkflowRunner instance
 */
export function createWorkflowRunner(options: WorkflowRunnerOptions): WorkflowRunner {
  return new WorkflowRunner(options);
}
