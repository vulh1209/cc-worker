/**
 * Type declarations for @anthropic-ai/claude-agent-sdk SDK
 * The SDK doesn't ship with TypeScript definitions, so we declare them here.
 */

declare module '@anthropic-ai/claude-agent-sdk' {
  export interface SDKMessage {
    type: 'assistant' | 'user' | 'result' | string;
    session_id?: string;
  }

  export interface SDKAssistantMessage extends SDKMessage {
    type: 'assistant';
    message?: {
      content?: unknown[];
    };
  }

  export interface SDKUserMessage extends SDKMessage {
    type: 'user';
    message?: {
      content?: unknown[];
    };
  }

  export interface QueryOptions {
    abortController?: AbortController;
    allowedTools?: string[];
    cwd?: string;
    maxTurns?: number;
    pathToClaudeCodeExecutable?: string;
    resume?: string;
    dangerouslySkipPermissions?: boolean;  // Skip permission prompts for headless execution
  }

  export interface QueryParams {
    prompt: string;
    options?: QueryOptions;
  }

  /**
   * Execute a Claude Code query with streaming responses
   */
  export function query(params: QueryParams): AsyncIterable<SDKMessage>;
}
