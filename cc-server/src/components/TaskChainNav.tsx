import Link from 'next/link';
import { StatusBadge } from './terminal-ui';

interface TaskChainItem {
  id: string;
  prompt: string;
  status: string;
  createdAt: Date;
}

interface TaskChainNavProps {
  parentTask: TaskChainItem | null;
  followUpTasks: TaskChainItem[];
  currentTaskId: string;
}

export function TaskChainNav({ parentTask, followUpTasks, currentTaskId }: TaskChainNavProps) {
  // Don't render if no chain exists
  if (!parentTask && followUpTasks.length === 0) {
    return null;
  }

  const truncatePrompt = (prompt: string, maxLength = 60) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  return (
    <div className="terminal-card mb-6">
      <div className="px-4 py-3 border-b border-border/50 bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          <span className="text-primary">⬡</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversation Thread
          </h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Parent task */}
        {parentTask && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-16 text-xs text-muted-foreground uppercase tracking-wider pt-0.5">
              Parent
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/tasks/${parentTask.id}`}
                className="group flex items-center gap-2 hover:text-primary transition-colors"
              >
                <span className="text-muted-foreground group-hover:text-primary">◀</span>
                <span className="text-sm truncate">{truncatePrompt(parentTask.prompt)}</span>
                <StatusBadge status={parentTask.status as any} size="sm" showDot={false} />
              </Link>
            </div>
          </div>
        )}

        {/* Divider if both parent and follow-ups exist */}
        {parentTask && followUpTasks.length > 0 && (
          <div className="border-t border-border/30" />
        )}

        {/* Follow-up tasks */}
        {followUpTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-16 text-xs text-muted-foreground uppercase tracking-wider pt-0.5">
                Follow-ups
              </div>
              <div className="flex-1 space-y-2">
                {followUpTasks.map((task, index) => {
                  const isCurrent = task.id === currentTaskId;
                  return (
                    <div key={task.id} className="flex items-center gap-2">
                      <span className="text-muted-foreground/50 text-xs w-4">
                        {index + 1}.
                      </span>
                      {isCurrent ? (
                        <div className="flex items-center gap-2 text-primary">
                          <span className="text-xs">●</span>
                          <span className="text-sm font-medium truncate">
                            {truncatePrompt(task.prompt)}
                          </span>
                          <StatusBadge status={task.status as any} size="sm" showDot={false} />
                        </div>
                      ) : (
                        <Link
                          href={`/tasks/${task.id}`}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          <span className="text-muted-foreground/50 group-hover:text-primary">▸</span>
                          <span className="text-sm truncate">{truncatePrompt(task.prompt)}</span>
                          <StatusBadge status={task.status as any} size="sm" showDot={false} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
