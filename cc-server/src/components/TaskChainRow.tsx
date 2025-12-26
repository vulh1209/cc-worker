'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  StatusBadge,
  TerminalButton,
  ProgressBar,
} from '@/components/terminal-ui';
import { formatRelativeTime, formatDuration, truncate } from '@/lib/utils';
import type { TaskChainGroup, TaskForChain } from '@/lib/task-chain-utils';

interface TaskChainRowProps {
  chain: TaskChainGroup;
  index: number;
}

export function TaskChainRow({ chain, index }: TaskChainRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { root, followUps, latestStatus, chainLength } = chain;
  const isLatestRunning = latestStatus === 'RUNNING';

  return (
    <>
      {/* Root task row */}
      <tr
        className="animate-slide-in cursor-pointer"
        style={{ animationDelay: `${index * 20}ms` }}
      >
        <td>
          <div className="flex items-center gap-2">
            <StatusBadge status={latestStatus as any} size="sm" />
            {isLatestRunning && (
              <div className="w-16">
                <ProgressBar value={50} color="yellow" striped size="sm" />
              </div>
            )}
          </div>
        </td>
        <td>
          <Link
            href={`/tasks/${root.id}`}
            className="font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {root.id.substring(0, 8)}
          </Link>
        </td>
        <td>
          <Link
            href={`/tasks/${root.id}`}
            className="block hover:text-primary transition-colors"
          >
            <p className="text-sm truncate max-w-md">
              {truncate(root.prompt, 60)}
            </p>
          </Link>
        </td>
        <td>
          {root.worker ? (
            <Link
              href={`/workers/${root.worker.id}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
            >
              <span className="status-indicator status-online w-1.5 h-1.5" />
              {root.worker.name}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              unassigned
            </span>
          )}
        </td>
        <td>
          <span className="text-sm text-muted-foreground tabular-nums">
            {root.duration ? formatDuration(root.duration) : '—'}
          </span>
        </td>
        <td>
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(root.createdAt)}
          </span>
        </td>
        <td>
          <div className="flex items-center gap-1">
            {chainLength > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className={`
                  px-1.5 py-0.5 text-xs font-mono rounded border transition-all
                  ${expanded
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-secondary/50 border-border/50 text-muted-foreground hover:border-primary/30 hover:text-primary'
                  }
                `}
                title={expanded ? 'Collapse chain' : `Show ${chainLength} follow-up${chainLength > 1 ? 's' : ''}`}
              >
                {expanded ? '−' : '+'}{chainLength}
              </button>
            )}
            <Link href={`/tasks/${root.id}`}>
              <TerminalButton variant="ghost" size="sm">
                →
              </TerminalButton>
            </Link>
          </div>
        </td>
      </tr>

      {/* Expanded follow-up rows */}
      {expanded &&
        followUps.map((task, i) => (
          <FollowUpRow
            key={task.id}
            task={task}
            isLast={i === followUps.length - 1}
          />
        ))}
    </>
  );
}

interface FollowUpRowProps {
  task: TaskForChain;
  isLast: boolean;
}

function FollowUpRow({ task, isLast }: FollowUpRowProps) {
  const isRunning = task.status === 'RUNNING';

  return (
    <tr className="bg-secondary/20 border-l-2 border-primary/30">
      <td>
        <div className="flex items-center gap-2 pl-4">
          <span className="text-muted-foreground/50 font-mono text-xs select-none">
            {isLast ? '└' : '├'}
          </span>
          <StatusBadge status={task.status as any} size="sm" />
          {isRunning && (
            <div className="w-12">
              <ProgressBar value={50} color="yellow" striped size="sm" />
            </div>
          )}
        </div>
      </td>
      <td>
        <Link
          href={`/tasks/${task.id}`}
          className="font-mono text-xs text-muted-foreground hover:text-primary"
        >
          {task.id.substring(0, 8)}
        </Link>
      </td>
      <td>
        <Link
          href={`/tasks/${task.id}`}
          className="block hover:text-primary transition-colors"
        >
          <p className="text-sm truncate max-w-md text-muted-foreground">
            {truncate(task.prompt, 55)}
          </p>
        </Link>
      </td>
      <td>
        {task.worker ? (
          <Link
            href={`/workers/${task.worker.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground/70 hover:text-primary"
          >
            <span className="status-indicator status-online w-1.5 h-1.5" />
            {task.worker.name}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">
            unassigned
          </span>
        )}
      </td>
      <td>
        <span className="text-sm text-muted-foreground/70 tabular-nums">
          {task.duration ? formatDuration(task.duration) : '—'}
        </span>
      </td>
      <td>
        <span className="text-sm text-muted-foreground/70">
          {formatRelativeTime(task.createdAt)}
        </span>
      </td>
      <td>
        <Link href={`/tasks/${task.id}`}>
          <TerminalButton variant="ghost" size="sm">
            →
          </TerminalButton>
        </Link>
      </td>
    </tr>
  );
}
