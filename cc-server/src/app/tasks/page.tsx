import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeTime, formatDuration, truncate } from '@/lib/utils';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getTasks() {
  return prisma.task.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      worker: {
        select: { id: true, name: true },
      },
    },
  });
}

export default async function TasksPage() {
  const tasks = await getTasks();

  const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
    PENDING: 'secondary',
    RUNNING: 'warning',
    COMPLETED: 'success',
    FAILED: 'destructive',
    CANCELLED: 'secondary',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">
            {tasks.length} tasks total
          </p>
        </div>
        <Link href="/tasks/new">
          <Button>Create Task</Button>
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No tasks yet</h3>
          <p className="text-muted-foreground mt-1">
            Create a task to start running Claude on your workers.
          </p>
          <Link href="/tasks/new" className="mt-4 inline-block">
            <Button>Create Your First Task</Button>
          </Link>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block py-4 hover:bg-accent/50 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusColors[task.status]}>
                          {task.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {task.id.substring(0, 8)}
                        </span>
                      </div>
                      <p className="font-medium">
                        {truncate(task.prompt, 100)}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span>
                          {task.worker ? task.worker.name : 'Unassigned'}
                        </span>
                        <span>{formatRelativeTime(task.createdAt)}</span>
                        {task.duration && (
                          <span>{formatDuration(task.duration)}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-muted-foreground">&rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
