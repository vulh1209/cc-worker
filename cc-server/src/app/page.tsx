import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [
    totalWorkers,
    onlineWorkers,
    totalTasks,
    runningTasks,
    completedTasks,
    failedTasks,
  ] = await Promise.all([
    prisma.worker.count(),
    prisma.worker.count({ where: { status: 'ONLINE' } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: 'RUNNING' } }),
    prisma.task.count({ where: { status: 'COMPLETED' } }),
    prisma.task.count({ where: { status: 'FAILED' } }),
  ]);

  return {
    totalWorkers,
    onlineWorkers,
    totalTasks,
    runningTasks,
    completedTasks,
    failedTasks,
  };
}

async function getRecentTasks() {
  return prisma.task.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      worker: {
        select: { name: true },
      },
    },
  });
}

export default async function HomePage() {
  const stats = await getStats();
  const recentTasks = await getRecentTasks();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your CC-Worker system
          </p>
        </div>
        <Link href="/tasks/new">
          <Button>Create Task</Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalWorkers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.onlineWorkers} online
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.runningTasks}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTasks} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.completedTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTasks > 0
                ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                : 0}
              % success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.failedTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTasks > 0
                ? Math.round((stats.failedTasks / stats.totalTasks) * 100)
                : 0}
              % failure rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>Last 5 tasks created</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No tasks yet. Create your first task to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {recentTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {task.prompt.substring(0, 60)}
                        {task.prompt.length > 60 ? '...' : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {task.worker?.name || 'Unassigned'} &bull;{' '}
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: 'bg-gray-500',
    RUNNING: 'bg-yellow-500',
    COMPLETED: 'bg-green-500',
    FAILED: 'bg-red-500',
    CANCELLED: 'bg-gray-400',
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs text-white ${
        colors[status] || 'bg-gray-500'
      }`}
    >
      {status}
    </span>
  );
}
