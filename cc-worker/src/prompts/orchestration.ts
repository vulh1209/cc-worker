import type { WorkerRoutingInfo, TaskType } from '../types/index.js';

export interface OrchestrationContext {
  taskId: string;
  prompt: string;
  priority: number;
  orchestrationDepth: number;
  availableWorkers: WorkerRoutingInfo[];
}

/**
 * Generate orchestration analysis prompt for Claude
 */
export function generateOrchestrationPrompt(context: OrchestrationContext): string {
  const { taskId, prompt, priority, orchestrationDepth, availableWorkers } = context;

  const workersInfo = availableWorkers.length > 0
    ? availableWorkers.map(w => `- **${w.name}** (ID: ${w.id})
  - Status: ${w.status}
  - OS: ${w.os || 'unknown'}
  - Last seen: ${w.lastSeen}`).join('\n')
    : 'No workers currently available';

  return `# Task Orchestration Analysis

You are a task orchestrator for a distributed Claude Code worker system. Your job is to analyze incoming tasks and decide the best handling strategy.

## Available Workers
${workersInfo}

## Task to Analyze
- **ID**: ${taskId}
- **Priority**: ${priority}
- **Orchestration Depth**: ${orchestrationDepth}
- **Prompt**:
\`\`\`
${prompt}
\`\`\`

## Decision Guidelines

Analyze the task and choose ONE of these strategies:

### 1. Route (assign to specific worker)
Use when:
- Task is straightforward and can be handled by a single worker
- A specific worker might be better suited (e.g., based on OS compatibility)
- Task doesn't need to be broken down

### 2. Adjust Priority (modify priority and re-queue)
Use when:
- Task priority seems incorrect for its urgency/complexity
- Task should be processed sooner or later than its current priority suggests

### 3. Decompose (split into subtasks)
Use when:
- Task involves multiple independent steps
- Breaking it down would improve efficiency or parallelization
- Orchestration depth (${orchestrationDepth}) is less than max (3)

${orchestrationDepth >= 2 ? '**WARNING**: Orchestration depth is high. Prefer routing or priority adjustment over further decomposition.' : ''}

## Your Response

Respond with ONLY a JSON object (no markdown, no explanation):

\`\`\`json
{
  "action": "route" | "adjust_priority" | "decompose",
  "reasoning": "Brief explanation (1-2 sentences)",

  // For "route":
  "targetWorkerId": "worker_id or null for any available",

  // For "adjust_priority":
  "newPriority": 0-100,

  // For "decompose":
  "subtasks": [
    {
      "prompt": "Subtask description",
      "priority": 0-100,
      "preferredWorkerId": "optional worker_id",
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ]
}
\`\`\`

Consider:
- Task complexity and estimated duration
- Worker availability (${availableWorkers.length} workers online)
- Task dependencies and logical decomposition
- System throughput optimization

Respond with the JSON decision only:`;
}

/**
 * Parse orchestration decision from Claude's response
 */
export function parseOrchestrationResponse(response: string): {
  action: 'route' | 'adjust_priority' | 'decompose';
  targetWorkerId?: string;
  newPriority?: number;
  subtasks?: Array<{
    prompt: string;
    priority: number;
    preferredWorkerId?: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
  }>;
  reasoning: string;
} | null {
  try {
    // Try to extract JSON from response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.action || !parsed.reasoning) {
      console.error('[Orchestration] Missing required fields in response');
      return null;
    }

    // Validate action type
    if (!['route', 'adjust_priority', 'decompose'].includes(parsed.action)) {
      console.error(`[Orchestration] Invalid action: ${parsed.action}`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[Orchestration] Failed to parse response:', error);
    console.error('[Orchestration] Response was:', response.substring(0, 500));
    return null;
  }
}
