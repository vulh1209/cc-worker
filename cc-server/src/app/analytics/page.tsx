import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getAnalytics() {
  const days = 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get task stats
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

  // Get worker stats
  const [totalWorkers, onlineWorkers, busyWorkers] = await Promise.all([
    prisma.worker.count(),
    prisma.worker.count({ where: { status: 'ONLINE' } }),
    prisma.worker.count({ where: { status: 'BUSY' } }),
  ]);

  // Get average task duration
  const avgDurationResult = await prisma.task.aggregate({
    _avg: { duration: true },
    where: { status: 'COMPLETED', duration: { not: null } },
  });

  // Get recent tasks with duration
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

  // Get top workers by completed tasks
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
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default async function AnalyticsPage() {
  const data = await getAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Performance metrics and insights
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {data.overview.successRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {data.overview.completedTasks} completed / {data.overview.failedTasks} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatDuration(data.overview.avgDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per completed task
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.overview.totalTasks}</div>
            <p className="text-xs text-muted-foreground">
              {data.overview.runningTasks} running, {data.overview.pendingTasks} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.workers.total}</div>
            <p className="text-xs text-muted-foreground">
              {data.workers.online} online, {data.workers.busy} busy
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Workers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Workers</CardTitle>
            <CardDescription>By number of tasks completed</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topWorkers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No workers yet
              </p>
            ) : (
              <div className="space-y-4">
                {data.topWorkers.map((worker, index) => (
                  <div
                    key={worker.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{worker.name}</p>
                        <Badge
                          variant={
                            worker.status === 'ONLINE'
                              ? 'success'
                              : worker.status === 'BUSY'
                                ? 'warning'
                                : 'secondary'
                          }
                        >
                          {worker.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{worker._count.tasks}</p>
                      <p className="text-xs text-muted-foreground">tasks</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Completed Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Completed Tasks</CardTitle>
            <CardDescription>Last 10 completed tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentCompletedTasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No completed tasks yet
              </p>
            ) : (
              <div className="space-y-3">
                {data.recentCompletedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate">
                        {task.prompt.substring(0, 40)}...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.worker?.name || 'Unknown'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatDuration(task.duration)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Task Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 rounded-lg bg-green-500/10">
              <p className="text-3xl font-bold text-green-600">
                {data.overview.completedTasks}
              </p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-yellow-500/10">
              <p className="text-3xl font-bold text-yellow-600">
                {data.overview.runningTasks}
              </p>
              <p className="text-sm text-muted-foreground">Running</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-500/10">
              <p className="text-3xl font-bold text-blue-600">
                {data.overview.pendingTasks}
              </p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-500/10">
              <p className="text-3xl font-bold text-red-600">
                {data.overview.failedTasks}
              </p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-gray-500/10">
              <p className="text-3xl font-bold text-gray-600">
                {data.overview.totalTasks}
              </p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
