import Link from 'next/link';
import {
  TerminalCard,
  EmptyState,
  TerminalButton,
} from '@/components/terminal-ui';
import { TaskChainRow } from '@/components/TaskChainRow';
import { groupTaskChains } from '@/lib/task-chain-utils';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getTasks() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100, // Fetch more since we'll group them
    select: {
      id: true,
      prompt: true,
      status: true,
      duration: true,
      createdAt: true,
      parentTaskId: true, // Required for chain grouping
      worker: {
        select: { id: true, name: true },
      },
    },
  });

  // Group tasks into chains
  return groupTaskChains(tasks);
}

async function getTaskStats() {
  const [running, pending, completed, failed] = await Promise.all([
    prisma.task.count({ where: { status: 'RUNNING' } }),
    prisma.task.count({ where: { status: 'PENDING' } }),
    prisma.task.count({ where: { status: 'COMPLETED' } }),
    prisma.task.count({ where: { status: 'FAILED' } }),
  ]);
  return { running, pending, completed, failed, total: running + pending + completed + failed };
}

export default async function TasksPage() {
  const [tasks, stats] = await Promise.all([getTasks(), getTaskStats()]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">▤</span>
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="terminal-prompt">
              {stats.total} total · {stats.running} running · {stats.pending} queued
            </span>
          </p>
        </div>
        <Link href="/tasks/new">
          <TerminalButton variant="primary">
            <span className="text-xs mr-1">+</span>
            new task
          </TerminalButton>
        </Link>
      </div>

      {/* Status Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusFilterTab count={stats.total} label="all" active />
          <StatusFilterTab count={stats.running} label="running" color="yellow" />
          <StatusFilterTab count={stats.pending} label="pending" color="gray" />
          <StatusFilterTab count={stats.completed} label="completed" color="green" />
          <StatusFilterTab count={stats.failed} label="failed" color="red" />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <TerminalButton variant="ghost" size="sm">
            ↻ refresh
          </TerminalButton>
        </div>
      </div>

      {/* Tasks Table */}
      {tasks.length === 0 ? (
        <TerminalCard>
          <EmptyState
            type="tasks"
            title="No tasks created"
            description="Create a task to start running Claude on your distributed workers."
            action={
              <Link href="/tasks/new">
                <TerminalButton variant="primary">
                  create your first task
                </TerminalButton>
              </Link>
            }
          />
        </TerminalCard>
      ) : (
        <TerminalCard noPadding>
          <div className="overflow-x-auto">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th className="w-28">Status</th>
                  <th className="w-20">ID</th>
                  <th>Prompt</th>
                  <th className="w-32">Worker</th>
                  <th className="w-24">Duration</th>
                  <th className="w-24">Created</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((chain, index) => (
                  <TaskChainRow key={chain.root.id} chain={chain} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        </TerminalCard>
      )}
    </div>
  );
}

function StatusFilterTab({
  count,
  label,
  color,
  active = false,
}: {
  count: number;
  label: string;
  color?: 'green' | 'yellow' | 'red' | 'gray';
  active?: boolean;
}) {
  const colorClasses = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    gray: 'text-gray-400',
  };

  const dotClasses = {
    green: 'status-online',
    yellow: 'status-busy',
    red: 'status-error',
    gray: 'status-offline',
  };

  return (
    <button
      className={`
        px-3 py-1.5 text-xs rounded border transition-colors
        ${active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-secondary/50 border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
        }
      `}
    >
      <span className="flex items-center gap-1.5">
        {color && (
          <span className={`status-indicator w-1.5 h-1.5 ${dotClasses[color]}`} />
        )}
        <span>{label}</span>
        <span className={color ? colorClasses[color] : ''}>{count}</span>
      </span>
    </button>
  );
}

