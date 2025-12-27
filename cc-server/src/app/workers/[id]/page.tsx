import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, formatDuration, getApiKeyPreview } from '@/lib/utils';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { checkWorkerAccess } from '@/lib/worker-permissions';
import { ShareWorkerSection } from './ShareWorkerSection';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getWorker(id: string) {
  return prisma.worker.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      _count: {
        select: { tasks: true },
      },
      owner: {
        select: { id: true, email: true, name: true },
      },
      sharedWith: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { sharedAt: 'desc' },
      },
    },
  });
}

async function getWorkerStats(id: string) {
  const [total, completed, failed, running] = await Promise.all([
    prisma.task.count({ where: { workerId: id } }),
    prisma.task.count({ where: { workerId: id, status: 'COMPLETED' } }),
    prisma.task.count({ where: { workerId: id, status: 'FAILED' } }),
    prisma.task.count({ where: { workerId: id, status: 'RUNNING' } }),
  ]);

  return { total, completed, failed, running };
}

export default async function WorkerDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Check access permission
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  const access = await checkWorkerAccess(id, 'view');
  if (!access.hasAccess) {
    notFound();
  }

  const [worker, stats] = await Promise.all([
    getWorker(id),
    getWorkerStats(id),
  ]);

  if (!worker) {
    notFound();
  }

  const isOwner = access.isOwner;

  const statusColors = {
    ONLINE: 'success',
    OFFLINE: 'secondary',
    BUSY: 'warning',
  } as const;

  const statusIcons = {
    ONLINE: '🟢',
    OFFLINE: '🔴',
    BUSY: '🟡',
  };

  const taskStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
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
          <div className="flex items-center gap-3">
            <span className="text-2xl">{statusIcons[worker.status]}</span>
            <h1 className="text-2xl font-bold">{worker.name}</h1>
            <Badge variant={statusColors[worker.status]}>{worker.status}</Badge>
          </div>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            {worker.id}
          </p>
        </div>
        <div className="flex gap-2">
          {worker.status === 'ONLINE' && (
            <Link href={`/tasks/new?workerId=${worker.id}`}>
              <Button>Send Task</Button>
            </Link>
          )}
          <Link href="/workers">
            <Button variant="outline">Back to Workers</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Worker Info */}
        <Card>
          <CardHeader>
            <CardTitle>Worker Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Operating System
              </label>
              <p>{worker.os || 'Unknown'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Hostname
              </label>
              <p>{worker.hostname || 'Unknown'}</p>
            </div>

            {worker.ipAddress && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  IP Address
                </label>
                <p>{worker.ipAddress}</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Last Seen
              </label>
              <p>{formatRelativeTime(worker.lastSeen)}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created
              </label>
              <p>{new Date(worker.createdAt).toLocaleDateString()}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                API Key
              </label>
              <p className="font-mono text-sm">
                {getApiKeyPreview(worker.apiKey)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Total Tasks
                </label>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Running
                </label>
                <p className="text-2xl font-bold text-yellow-500">
                  {stats.running}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Completed
                </label>
                <p className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Failed
                </label>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Success Rate
              </label>
              <p className="text-xl font-bold">
                {stats.total > 0
                  ? Math.round((stats.completed / stats.total) * 100)
                  : 0}
                %
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {worker.status === 'ONLINE' && (
              <Link href={`/tasks/new?workerId=${worker.id}`} className="block">
                <Button className="w-full">Send New Task</Button>
              </Link>
            )}

            {isOwner && <DeleteWorkerButton workerId={worker.id} />}

            {!isOwner && (
              <p className="text-xs text-muted-foreground text-center">
                Shared by {worker.owner?.name || worker.owner?.email}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sharing Section - Owner only */}
      {isOwner && (
        <ShareWorkerSection
          workerId={worker.id}
          sharedWith={worker.sharedWith}
        />
      )}

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {worker.tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No tasks yet for this worker.
            </p>
          ) : (
            <div className="divide-y">
              {worker.tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block py-4 hover:bg-accent/50 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={taskStatusColors[task.status]}>
                          {task.status}
                        </Badge>
                      </div>
                      <p className="truncate">
                        {task.prompt.substring(0, 80)}
                        {task.prompt.length > 80 ? '...' : ''}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteWorkerButton({ workerId }: { workerId: string }) {
  return (
    <form
      action={async () => {
        'use server';
        const { redirect } = await import('next/navigation');
        await fetch(
          `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/workers/${workerId}`,
          { method: 'DELETE' }
        );
        redirect('/workers');
      }}
    >
      <Button type="submit" variant="destructive" className="w-full">
        Delete Worker
      </Button>
    </form>
  );
}
