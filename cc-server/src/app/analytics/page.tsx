import {
  TerminalCard,
  StatCard,
  StatusBadge,
  ProgressBar,
  Divider,
} from '@/components/terminal-ui';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/components/AuthGuard';

export const dynamic = 'force-dynamic';

async function getAnalytics() {
  const [
    totalTasks,
    completedTasks,
    failedTasks,
    runningTasks,
    pendingTasks,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.count({ where: { status: 'COMPLETED' } }),
    prisma.task.count({ where: { status: 'FAILED' } }),
    prisma.task.count({ where: { status: 'RUNNING' } }),
    prisma.task.count({ where: { status: 'PENDING' } }),
  ]);

  const [totalWorkers, onlineWorkers, busyWorkers] = await Promise.all([
    prisma.worker.count(),
    prisma.worker.count({ where: { status: 'ONLINE' } }),
    prisma.worker.count({ where: { status: 'BUSY' } }),
  ]);

  const avgDurationResult = await prisma.task.aggregate({
    _avg: { duration: true },
    where: { status: 'COMPLETED', duration: { not: null } },
  });

  const recentCompletedTasks = await prisma.task.findMany({
    where: { status: 'COMPLETED', duration: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      prompt: true,
      duration: true,
      completedAt: true,
      worker: { select: { name: true } },
    },
  });

  const topWorkers = await prisma.worker.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: { tasks: true },
      },
    },
    orderBy: {
      tasks: {
        _count: 'desc',
      },
    },
    take: 5,
  });

  const totalFinished = completedTasks + failedTasks;
  const successRate = totalFinished > 0 ? (completedTasks / totalFinished) * 100 : 0;

  return {
    overview: {
      totalTasks,
      completedTasks,
      failedTasks,
      runningTasks,
      pendingTasks,
      successRate: Math.round(successRate * 10) / 10,
      avgDuration: avgDurationResult._avg.duration,
    },
    workers: {
      total: totalWorkers,
      online: onlineWorkers,
      busy: busyWorkers,
    },
    recentCompletedTasks,
    topWorkers,
  };
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default async function AnalyticsPage() {
  await requireAuth('/analytics');
  const data = await getAnalytics();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="text-primary">◭</span>
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="terminal-prompt">performance metrics and insights</span>
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Success Rate"
          value={`${data.overview.successRate}%`}
          subtitle={`${data.overview.completedTasks} completed / ${data.overview.failedTasks} failed`}
          color={data.overview.successRate >= 90 ? 'green' : data.overview.successRate >= 70 ? 'yellow' : 'red'}
          icon={<span className="text-lg">✓</span>}
        />

        <StatCard
          title="Avg Duration"
          value={formatDuration(data.overview.avgDuration)}
          subtitle="per completed task"
          color="blue"
          icon={<span className="text-lg">⏱</span>}
        />

        <StatCard
          title="Total Tasks"
          value={data.overview.totalTasks}
          subtitle={`${data.overview.runningTasks} running, ${data.overview.pendingTasks} pending`}
          color="orange"
          icon={<span className="text-lg">▤</span>}
        />

        <StatCard
          title="Workers"
          value={data.workers.total}
          subtitle={`${data.workers.online} online, ${data.workers.busy} busy`}
          color="blue"
          icon={<span className="text-lg">⬡</span>}
        />
      </div>

      {/* Task Status Breakdown */}
      <TerminalCard title="Task Status Distribution">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatusBlock
            label="Completed"
            value={data.overview.completedTasks}
            total={data.overview.totalTasks}
            color="green"
          />
          <StatusBlock
            label="Running"
            value={data.overview.runningTasks}
            total={data.overview.totalTasks}
            color="yellow"
          />
          <StatusBlock
            label="Pending"
            value={data.overview.pendingTasks}
            total={data.overview.totalTasks}
            color="blue"
          />
          <StatusBlock
            label="Failed"
            value={data.overview.failedTasks}
            total={data.overview.totalTasks}
            color="red"
          />
          <StatusBlock
            label="Total"
            value={data.overview.totalTasks}
            total={data.overview.totalTasks}
            color="gray"
          />
        </div>
      </TerminalCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Workers */}
        <TerminalCard title="Top Workers" subtitle="by tasks completed">
          {data.topWorkers.length === 0 ? (
            <div className="text-center py-8">
              <pre className="ascii-art text-xs mb-4">{`
  ╔═══════════════╗
  ║   ◇     ◇     ║
  ║      ___      ║
  ║     /   \\     ║
  ║    |  ?  |    ║
  ║     \\___/     ║
  ╚═══════════════╝
              `}</pre>
              <p className="text-muted-foreground text-sm">No workers yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.topWorkers.map((worker, index) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between p-3 rounded border border-border/30 hover:border-border transition-colors animate-slide-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-muted-foreground w-8">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{worker.name}</p>
                      <StatusBadge status={worker.status as any} size="sm" />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary tabular-nums">
                      {worker._count.tasks}
                    </p>
                    <p className="text-xs text-muted-foreground">tasks</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TerminalCard>

        {/* Recent Completed Tasks */}
        <TerminalCard title="Recent Completions" subtitle="last 10 tasks">
          {data.recentCompletedTasks.length === 0 ? (
            <div className="text-center py-8">
              <pre className="ascii-art text-xs mb-4">{`
  ┌─────────────────┐
  │  ☐ ─────────    │
  │  ☐ ─────────    │
  │  ☐ ─────────    │
  │       ...       │
  └─────────────────┘
              `}</pre>
              <p className="text-muted-foreground text-sm">No completed tasks yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recentCompletedTasks.map((task, index) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2 border-b border-border/20 last:border-0 animate-slide-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {task.prompt.substring(0, 35)}...
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="text-primary/50">⬡</span>
                      {task.worker?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-medium text-green-400 tabular-nums">
                      {formatDuration(task.duration)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TerminalCard>
      </div>

      {/* Performance Chart Placeholder */}
      <TerminalCard title="Performance Trend" subtitle="coming soon">
        <div className="h-48 flex items-center justify-center border border-dashed border-border/50 rounded">
          <div className="text-center">
            <pre className="ascii-art text-xs mb-2">{`
    ╭────────────────────────────╮
    │  ┌─┐                       │
    │  │ │     ┌─┐               │
    │  │ │ ┌─┐ │ │     ┌─┐       │
    │──┴─┴─┴─┴─┴─┴─────┴─┴───────│
    │  Mon Tue Wed Thu Fri Sat   │
    ╰────────────────────────────╯
            `}</pre>
            <p className="text-xs text-muted-foreground">
              Charts coming in a future update
            </p>
          </div>
        </div>
      </TerminalCard>
    </div>
  );
}

function StatusBlock({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'green' | 'yellow' | 'blue' | 'red' | 'gray';
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  const colorClasses = {
    green: 'text-green-400 bg-green-500/10 border-green-500/30',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    red: 'text-red-400 bg-red-500/10 border-red-500/30',
    gray: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  };

  const progressColors: Record<string, 'green' | 'yellow' | 'blue' | 'orange'> = {
    green: 'green',
    yellow: 'yellow',
    blue: 'blue',
    red: 'orange',
    gray: 'orange',
  };

  return (
    <div className={`text-center p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {color !== 'gray' && total > 0 && (
        <div className="mt-2">
          <ProgressBar
            value={percentage}
            color={progressColors[color]}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}
