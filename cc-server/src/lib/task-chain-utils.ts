/**
 * Utility functions for grouping task chains in the task list
 *
 * Task chains are linear (1-1 relationship): Task A → Task B → Task C
 * Each task has at most one parent (parentTaskId) and one child (follow-up)
 */

export interface TaskForChain {
  id: string;
  prompt: string;
  status: string;
  duration: number | null;
  createdAt: Date;
  parentTaskId: string | null;
  worker: { id: string; name: string } | null;
}

export interface TaskChainGroup {
  root: TaskForChain;
  followUps: TaskForChain[];  // Ordered by creation time (oldest first)
  latestStatus: string;       // Status of the latest task in chain
  chainLength: number;        // Number of follow-ups (not including root)
}

/**
 * Groups a flat list of tasks into chains based on parentTaskId relationships.
 * Returns an array of TaskChainGroup, sorted by the creation time of the root task (newest first).
 *
 * @param tasks - Flat list of tasks
 * @returns Array of task chain groups
 */
export function groupTaskChains(tasks: TaskForChain[]): TaskChainGroup[] {
  // Build lookup maps
  const taskMap = new Map<string, TaskForChain>();
  const childrenMap = new Map<string, TaskForChain>(); // parentId -> child task

  for (const task of tasks) {
    taskMap.set(task.id, task);
    if (task.parentTaskId) {
      childrenMap.set(task.parentTaskId, task);
    }
  }

  // Find root tasks (no parent) and build chains
  const chains: TaskChainGroup[] = [];
  const processedIds = new Set<string>();

  for (const task of tasks) {
    // Skip if already processed as part of another chain
    if (processedIds.has(task.id)) continue;

    // Skip if this task has a parent (it's part of another chain)
    if (task.parentTaskId) continue;

    // This is a root task - build the chain
    const followUps: TaskForChain[] = [];
    let current = task;
    processedIds.add(current.id);

    // Walk the chain forward
    while (childrenMap.has(current.id)) {
      const child = childrenMap.get(current.id)!;
      followUps.push(child);
      processedIds.add(child.id);
      current = child;
    }

    // Latest task is either the last follow-up or the root itself
    const latestTask = followUps.length > 0 ? followUps[followUps.length - 1] : task;

    chains.push({
      root: task,
      followUps,
      latestStatus: latestTask.status,
      chainLength: followUps.length,
    });
  }

  // Sort by root's createdAt (newest first)
  chains.sort((a, b) => b.root.createdAt.getTime() - a.root.createdAt.getTime());

  return chains;
}

/**
 * Flattens a TaskChainGroup back to a list of tasks for display.
 * Useful when you need all tasks in display order (root first, then follow-ups)
 */
export function flattenChain(chain: TaskChainGroup): TaskForChain[] {
  return [chain.root, ...chain.followUps];
}
