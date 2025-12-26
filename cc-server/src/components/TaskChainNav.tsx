'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge } from './terminal-ui';

interface TaskChainItem {
  id: string;
  prompt: string;
  status: string;
  createdAt: Date;
}

interface TaskChainNavProps {
  currentTaskId: string;
  parentTaskId: string | null;
  hasFollowUp: boolean;
  followUpTaskId?: string;
}

interface ChainData {
  previousTasks: TaskChainItem[];
  nextTask: TaskChainItem | null;
}

export function TaskChainNav({ currentTaskId, parentTaskId, hasFollowUp, followUpTaskId }: TaskChainNavProps) {
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch if there's a chain (has parent or follow-up)
    if (!parentTaskId && !hasFollowUp) {
      setLoading(false);
      return;
    }

    async function fetchChain() {
      try {
        const response = await fetch(`/api/tasks/${currentTaskId}/chain`);
        if (response.ok) {
          const data = await response.json();
          setChainData(data);
        }
      } catch (error) {
        console.error('Failed to fetch task chain:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchChain();
  }, [currentTaskId, parentTaskId, hasFollowUp]);

  // Don't render if no chain exists
  if (!parentTaskId && !hasFollowUp) {
    return null;
  }

  if (loading) {
    return (
      <div className="terminal-card mb-6">
        <div className="px-4 py-3 text-sm text-muted-foreground animate-pulse">
          Loading conversation chain...
        </div>
      </div>
    );
  }

  if (!chainData) {
    return null;
  }

  const { previousTasks, nextTask } = chainData;
  const hasPrevious = previousTasks.length > 0;
  const hasNext = !!nextTask;

  if (!hasPrevious && !hasNext) {
    return null;
  }

  const truncatePrompt = (prompt: string, maxLength = 50) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  return (
    <div className="terminal-card mb-6">
      <div className="px-4 py-3 border-b border-border/50 bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          <span className="text-primary">⬡</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversation Chain
          </h3>
          <span className="text-xs text-muted-foreground/50">
            (1 → 1 linear)
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous tasks (up to 2) */}
          {previousTasks.map((task, index) => (
            <div key={task.id} className="flex items-center gap-2">
              <Link
                href={`/tasks/${task.id}`}
                className="group flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated hover:bg-primary/10 transition-colors"
              >
                <span className="text-muted-foreground/50 text-xs">
                  {index === 0 && previousTasks.length === 2 ? '◀◀' : '◀'}
                </span>
                <span className="text-sm truncate max-w-[120px] group-hover:text-primary transition-colors">
                  {truncatePrompt(task.prompt, 25)}
                </span>
                <StatusBadge status={task.status as any} size="sm" showDot={false} />
              </Link>
              <span className="text-muted-foreground/30">→</span>
            </div>
          ))}

          {/* Current task */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/20 border border-primary/30">
            <span className="text-primary text-xs">●</span>
            <span className="text-sm font-medium text-primary">Current</span>
          </div>

          {/* Next task (if exists) */}
          {nextTask && (
            <>
              <span className="text-muted-foreground/30">→</span>
              <Link
                href={`/tasks/${nextTask.id}`}
                className="group flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated hover:bg-primary/10 transition-colors"
              >
                <span className="text-sm truncate max-w-[120px] group-hover:text-primary transition-colors">
                  {truncatePrompt(nextTask.prompt, 25)}
                </span>
                <StatusBadge status={nextTask.status as any} size="sm" showDot={false} />
                <span className="text-muted-foreground/50 text-xs">▶</span>
              </Link>
            </>
          )}
        </div>

        {/* Navigation hints */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground/60">
          {hasPrevious && (
            <span>◀ {previousTasks.length} previous {previousTasks.length === 1 ? 'task' : 'tasks'}</span>
          )}
          {hasNext && (
            <span>▶ Continue to follow-up</span>
          )}
        </div>
      </div>
    </div>
  );
}
