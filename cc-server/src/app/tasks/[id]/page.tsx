import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LiveLogViewer } from '@/components/LiveLogViewer';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import prisma from '@/lib/prisma';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTask(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      worker: {
        select: { id: true, name: true, status: true },
      },
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  return task;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getTask(id);

  if (!task) {
    notFound();
  }

  const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
    PENDING: 'secondary',
    RUNNING: 'warning',
    COMPLETED: 'success',
    FAILED: 'destructive',
    CANCELLED: 'secondary',
  };

  const isRunning = task.status === 'RUNNING';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Task</h1>
            <Badge variant={statusColors[task.status]}>{task.status}</Badge>
          </div>
          <p className="text-muted-foreground font-mono text-sm">{task.id}</p>
        </div>
        <div className="flex gap-2">
          {isRunning && <CancelButton taskId={task.id} />}
          <Link href="/tasks">
            <Button variant="outline">Back to Tasks</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Task Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Worker
              </label>
              <p>
                {task.worker ? (
                  <Link
                    href={`/workers/${task.worker.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {task.worker.name}
                  </Link>
                ) : (
                  'Unassigned'
                )}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created
              </label>
              <p>{formatRelativeTime(task.createdAt)}</p>
            </div>

            {task.startedAt && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Started
                </label>
                <p>{formatRelativeTime(task.startedAt)}</p>
              </div>
            )}

            {task.completedAt && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Completed
                </label>
                <p>{formatRelativeTime(task.completedAt)}</p>
              </div>
            )}

            {task.duration && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Duration
                </label>
                <p>{formatDuration(task.duration)}</p>
              </div>
            )}

            {task.errorMessage && (
              <div>
                <label className="text-sm font-medium text-red-600">
                  Error
                </label>
                <p className="text-red-600">{task.errorMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prompt & Logs */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap text-sm">
                {task.prompt}
              </pre>
            </CardContent>
          </Card>

          {task.result && (
            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap text-sm">
                  {task.result}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Execution Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <LiveLogViewer
                taskId={task.id}
                initialLogs={task.logs}
                isRunning={isRunning}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CancelButton({ taskId }: { taskId: string }) {
  return (
    <form
      action={async () => {
        'use server';
        await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/tasks/${taskId}/cancel`, {
          method: 'POST',
        });
      }}
    >
      <Button type="submit" variant="destructive">
        Cancel Task
      </Button>
    </form>
  );
}
