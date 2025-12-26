import Link from 'next/link';
import {
  TerminalCard,
  StatCard,
  StatusBadge,
  ProgressBar,
  EmptyState,
  ActivityItem,
  TerminalButton,
} from '@/components/terminal-ui';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [
    totalWorkers,
    onlineWorkers,
    busyWorkers,
    totalTasks,
    runningTasks,
    pendingTasks,
    completedTasks,
    failedTasks,
  ] = await Promise.all([
    prisma.worker.count(),
    prisma.worker.count({ where: { status: 'ONLINE' } }),
    prisma.worker.count({ where: { status: 'BUSY' } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: 'RUNNING' } }),
    prisma.task.count({ where: { status: 'PENDING' } }),
    prisma.task.count({ where: { status: 'COMPLETED' } }),
    prisma.task.count({ where: { status: 'FAILED' } }),
  ]);

  const totalFinished = completedTasks + failedTasks;
  const successRate = totalFinished > 0 ? Math.round((completedTasks / totalFinished) * 100) : 0;

  return {
    totalWorkers,
    onlineWorkers,
    busyWorkers,
    totalTasks,
    runningTasks,
    pendingTasks,
    completedTasks,
    failedTasks,
    successRate,
  };
}

async function getRecentTasks() {
  return prisma.task.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    include: {
      worker: {
        select: { name: true },
      },
    },
  });
}

async function getRecentWorkers() {
  return prisma.worker.findMany({
    take: 5,
    orderBy: { lastSeen: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      os: true,
      lastSeen: true,
    },
  });
}

export default async function HomePage() {
  const stats = await getStats();
  const recentTasks = await getRecentTasks();
  const recentWorkers = await getRecentWorkers();

  const activeWorkers = stats.onlineWorkers + stats.busyWorkers;
  const queueProgress = stats.totalTasks > 0
    ? Math.round(((stats.completedTasks + stats.failedTasks) / stats.totalTasks) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">◈</span>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="terminal-prompt">system overview</span>
          </p>
        </div>
        <Link href="/tasks/new">
          <TerminalButton variant="primary">
            <span className="text-xs mr-1">+</span>
            new task
          </TerminalButton>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Workers"
          value={`${activeWorkers}/${stats.totalWorkers}`}
          subtitle={`${stats.onlineWorkers} online · ${stats.busyWorkers} busy`}
          color="blue"
          icon={<span className="text-lg">⬡</span>}
        />

        <StatCard
          title="Running Tasks"
          value={stats.runningTasks}
          subtitle={`${stats.pendingTasks} in queue`}
          color="yellow"
          icon={<span className="text-lg">⚡</span>}
        />

        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          subtitle={`${stats.completedTasks} completed`}
          color="green"
          icon={<span className="text-lg">✓</span>}
        />

        <StatCard
          title="Failed"
          value={stats.failedTasks}
          subtitle={stats.failedTasks > 0 ? 'needs attention' : 'all clear'}
          color={stats.failedTasks > 0 ? 'red' : 'default'}
          icon={<span className="text-lg">✗</span>}
        />
      </div>

      {/* Queue Progress */}
      {stats.totalTasks > 0 && (
        <TerminalCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Queue Progress
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.completedTasks + stats.failedTasks}/{stats.totalTasks} processed
            </span>
          </div>
          <ProgressBar
            value={queueProgress}
            color="orange"
            striped={stats.runningTasks > 0}
            showLabel
          />
        </TerminalCard>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Tasks - Takes 2 columns */}
        <div className="lg:col-span-2">
          <TerminalCard
            title="Recent Tasks"
            subtitle={`${recentTasks.length} latest`}
            headerActions={
              <Link href="/tasks">
                <TerminalButton variant="ghost" size="sm">
                  view all →
                </TerminalButton>
              </Link>
            }
            noPadding
          >
            {recentTasks.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  type="tasks"
                  title="No tasks yet"
                  description="Create your first task to start running Claude on your workers."
                  action={
                    <Link href="/tasks/new">
                      <TerminalButton variant="primary" size="sm">
                        create task
                      </TerminalButton>
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {recentTasks.map((task, index) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="block px-4 py-3 hover:bg-primary/5 transition-colors animate-slide-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={task.status as any} size="sm" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {task.id.substring(0, 8)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate">
                          {task.prompt.substring(0, 60)}
                          {task.prompt.length > 60 ? '...' : ''}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="text-primary/50">⬡</span>
                            {task.worker?.name || 'unassigned'}
                          </span>
                          <span>{formatRelativeTime(task.createdAt)}</span>
                        </div>
                      </div>
                      <span className="text-muted-foreground text-xs">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TerminalCard>
        </div>

        {/* Workers Sidebar */}
        <div className="space-y-6">
          {/* Active Workers */}
          <TerminalCard
            title="Workers"
            subtitle={`${activeWorkers} active`}
            headerActions={
              <Link href="/workers">
                <TerminalButton variant="ghost" size="sm">
                  manage →
                </TerminalButton>
              </Link>
            }
          >
            {recentWorkers.length === 0 ? (
              <EmptyState
                type="workers"
                title="No workers"
                description="Add a worker to start distributing tasks."
                action={
                  <Link href="/workers/new">
                    <TerminalButton variant="primary" size="sm">
                      add worker
                    </TerminalButton>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {recentWorkers.map((worker, index) => (
                  <Link
                    key={worker.id}
                    href={`/workers/${worker.id}`}
                    className="block animate-slide-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center justify-between p-2 -mx-2 rounded hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span
                          className={`status-indicator ${
                            worker.status === 'ONLINE'
                              ? 'status-online'
                              : worker.status === 'BUSY'
                              ? 'status-busy'
                              : 'status-offline'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {worker.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {worker.os || 'unknown os'}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={worker.status as any} size="sm" showDot={false} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TerminalCard>

          {/* Quick Stats */}
          <TerminalCard title="Statistics">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Tasks</span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {stats.totalTasks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed</span>
                <span className="text-sm font-medium text-green-400 tabular-nums">
                  {stats.completedTasks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Failed</span>
                <span className="text-sm font-medium text-red-400 tabular-nums">
                  {stats.failedTasks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Running</span>
                <span className="text-sm font-medium text-yellow-400 tabular-nums">
                  {stats.runningTasks}
                </span>
              </div>
              <div className="pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Success Rate</span>
                  <span className={`text-sm font-bold ${
                    stats.successRate >= 90
                      ? 'text-green-400'
                      : stats.successRate >= 70
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }`}>
                    {stats.successRate}%
                  </span>
                </div>
              </div>
            </div>
          </TerminalCard>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
