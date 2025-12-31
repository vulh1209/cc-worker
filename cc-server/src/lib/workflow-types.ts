/**
 * Shared workflow types for cc-server
 * These mirror the types in cc-worker for consistency
 */

export type WorkflowModel = 'sonnet' | 'haiku' | 'opus';

export interface WorkflowStep {
  name: string;
  prompt: string;
  model?: WorkflowModel;
  allowedTools?: string[];
  maxTurns?: number;
  continueFromPrevious?: boolean;
  conditions?: {
    onSuccess?: 'continue' | 'skip_to_end' | number;
    onFailure?: 'fail' | 'retry' | 'skip' | number;
    maxRetries?: number;
  };
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  defaultModel?: WorkflowModel;
}

/**
 * Validate workflow definition structure
 */
export function validateWorkflow(workflow: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!workflow || typeof workflow !== 'object') {
    return { valid: false, errors: ['Workflow must be an object'] };
  }

  const w = workflow as Record<string, unknown>;

  // Check required fields
  if (!w.name || typeof w.name !== 'string') {
    errors.push('Workflow name is required and must be a string');
  }

  if (!w.steps || !Array.isArray(w.steps)) {
    errors.push('Workflow steps is required and must be an array');
    return { valid: false, errors };
  }

  if (w.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  }

  // Validate each step
  w.steps.forEach((step: unknown, index: number) => {
    if (!step || typeof step !== 'object') {
      errors.push(`Step ${index + 1} must be an object`);
      return;
    }

    const s = step as Record<string, unknown>;

    if (!s.name || typeof s.name !== 'string') {
      errors.push(`Step ${index + 1}: name is required and must be a string`);
    }

    if (!s.prompt || typeof s.prompt !== 'string') {
      errors.push(`Step ${index + 1}: prompt is required and must be a string`);
    }

    if (s.model !== undefined && !['sonnet', 'haiku', 'opus'].includes(s.model as string)) {
      errors.push(`Step ${index + 1}: model must be 'sonnet', 'haiku', or 'opus'`);
    }

    if (s.allowedTools !== undefined && !Array.isArray(s.allowedTools)) {
      errors.push(`Step ${index + 1}: allowedTools must be an array`);
    }

    if (s.maxTurns !== undefined && (typeof s.maxTurns !== 'number' || s.maxTurns < 1)) {
      errors.push(`Step ${index + 1}: maxTurns must be a positive number`);
    }

    if (s.continueFromPrevious !== undefined && typeof s.continueFromPrevious !== 'boolean') {
      errors.push(`Step ${index + 1}: continueFromPrevious must be a boolean`);
    }
  });

  // Validate defaultModel
  if (w.defaultModel !== undefined && !['sonnet', 'haiku', 'opus'].includes(w.defaultModel as string)) {
    errors.push("defaultModel must be 'sonnet', 'haiku', or 'opus'");
  }

  return { valid: errors.length === 0, errors };
}
