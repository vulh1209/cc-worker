import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  TerminalCard,
  TerminalWindow,
  StatusBadge,
  TerminalButton,
  ProgressBar,
} from '@/components/terminal-ui';
import { LiveLogViewer } from '@/components/LiveLogViewer';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ChatInput } from '@/components/ChatInput';
import { TaskChainNav } from '@/components/TaskChainNav';
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
      // Check if this task has a follow-up (for 1-1 chain - block new follow-ups)
      followUpTasks: {
        select: { id: true },
        take: 1,
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

  const isRunning = task.status === 'RUNNING';
  const isPending = task.status === 'PENDING';
  const isCompleted = task.status === 'COMPLETED';
  const isFailed = task.status === 'FAILED';
  const isFollowUp = !!task.parentTaskId;
  const hasFollowUp = task.followUpTasks && task.followUpTasks.length > 0;
  const followUpTaskId = hasFollowUp ? task.followUpTasks[0].id : undefined;
  // Can only continue if: completed, has session, AND doesn't already have a follow-up (1-1 chain)
  const canContinue = isCompleted && task.sessionId && !hasFollowUp;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="text-primary">▤</span>
              Task
            </h1>
            <StatusBadge status={task.status as any} />
            {isFollowUp && (
              <span className="terminal-badge terminal-badge-info text-[10px] px-1.5 py-0">
                FOLLOW-UP
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            {task.id}
          </p>
        </div>
        <div className="flex gap-2">
          {isRunning && <CancelButton taskId={task.id} />}
          {isFailed && <RetryButton taskId={task.id} />}
          {(isFailed || isCompleted || task.status === 'CANCELLED') && (
            <DeleteButton taskId={task.id} />
          )}
          <Link href="/tasks">
            <TerminalButton variant="ghost">
              ← back to tasks
            </TerminalButton>
          </Link>
        </div>
      </div>

      {/* Task Chain Navigation */}
      <TaskChainNav
        currentTaskId={task.id}
        parentTaskId={task.parentTaskId}
        hasFollowUp={hasFollowUp}
        followUpTaskId={followUpTaskId}
      />

      {/* Progress Bar for Running Tasks */}
      {isRunning && (
        <TerminalCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-yellow-400 uppercase tracking-wider">
              Executing...
            </span>
            <span className="text-xs text-muted-foreground animate-pulse">
              ● processing
            </span>
          </div>
          <ProgressBar value={50} color="yellow" striped />
        </TerminalCard>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Task Details - Left Column */}
        <div className="space-y-6">
          <TerminalCard title="Details">
            <div className="space-y-4">
              {/* Worker */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Worker
                </label>
                <p className="mt-1">
                  {task.worker ? (
                    <Link
                      href={`/workers/${task.worker.id}`}
                      className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
                    >
                      <span
                        className={`status-indicator ${
                          task.worker.status === 'ONLINE'
                            ? 'status-online'
                            : task.worker.status === 'BUSY'
                            ? 'status-busy'
                            : 'status-offline'
                        }`}
                      />
                      {task.worker.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground italic">unassigned</span>
                  )}
                </p>
              </div>

              {/* Created */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Created
                </label>
                <p className="mt-1 text-foreground">
                  {formatRelativeTime(task.createdAt)}
                </p>
              </div>

              {/* Started */}
              {task.startedAt && (
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Started
                  </label>
                  <p className="mt-1 text-foreground">
                    {formatRelativeTime(task.startedAt)}
                  </p>
                </div>
              )}

              {/* Completed */}
              {task.completedAt && (
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Completed
                  </label>
                  <p className="mt-1 text-foreground">
                    {formatRelativeTime(task.completedAt)}
                  </p>
                </div>
              )}

              {/* Duration */}
              {task.duration && (
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Duration
                  </label>
                  <p className="mt-1 text-foreground tabular-nums">
                    {formatDuration(task.duration)}
                  </p>
                </div>
              )}

              {/* Status Indicator */}
              <div className="pt-4 border-t border-border/30">
                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <>
                      <span className="text-green-400">✓</span>
                      <span className="text-green-400 text-sm">Task completed successfully</span>
                    </>
                  )}
                  {isFailed && (
                    <>
                      <span className="text-red-400">✗</span>
                      <span className="text-red-400 text-sm">Task failed</span>
                    </>
                  )}
                  {isRunning && (
                    <>
                      <span className="text-yellow-400 animate-pulse">●</span>
                      <span className="text-yellow-400 text-sm">Task is running</span>
                    </>
                  )}
                  {isPending && (
                    <>
                      <span className="text-gray-400">○</span>
                      <span className="text-gray-400 text-sm">Waiting in queue</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </TerminalCard>

          {/* Error Message */}
          {task.errorMessage && (
            <TerminalCard className="border-red-500/30">
              <div className="flex items-start gap-2">
                <span className="text-red-400">❌</span>
                <div>
                  <p className="text-xs uppercase tracking-wider text-red-400 mb-1">
                    Error
                  </p>
                  <p className="text-sm text-red-400">{task.errorMessage}</p>
                </div>
              </div>
            </TerminalCard>
          )}
        </div>

        {/* Content - Right Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prompt */}
          <TerminalWindow title="prompt">
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words">
              {task.prompt}
            </pre>
          </TerminalWindow>

          {/* Result */}
          {task.result && (
            <TerminalWindow title="result">
              <div className="markdown-content">
                <MarkdownRenderer content={task.result} />
              </div>
            </TerminalWindow>
          )}

          {/* Logs */}
          <TerminalCard title="Execution Logs" noPadding>
            <div className="p-4">
              <LiveLogViewer
                taskId={task.id}
                initialLogs={task.logs}
                initialStatus={task.status as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'}
              />
            </div>
          </TerminalCard>

          {/* Continue Conversation - only show for completed tasks with session */}
          {isCompleted && task.sessionId && (
            <TerminalCard title="Continue Conversation">
              {hasFollowUp ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-yellow-400">→</span>
                    <span>This task already has a follow-up.</span>
                  </div>
                  <Link href={`/tasks/${followUpTaskId}`}>
                    <TerminalButton variant="ghost" size="sm">
                      Go to follow-up ▸
                    </TerminalButton>
                  </Link>
                </div>
              ) : (
                <ChatInput
                  taskId={task.id}
                  sessionId={task.sessionId}
                  workerStatus={task.worker?.status || null}
                  workerName={task.worker?.name || null}
                />
              )}
            </TerminalCard>
          )}
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
      <TerminalButton type="submit" variant="destructive">
        ✗ cancel task
      </TerminalButton>
    </form>
  );
}

function RetryButton({ taskId }: { taskId: string }) {
  async function retryTask() {
    'use server';
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/tasks/${taskId}/retry`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.newTaskId) {
      const { redirect } = await import('next/navigation');
      redirect(`/tasks/${data.newTaskId}`);
    }
  }

  return (
    <form action={retryTask}>
      <TerminalButton type="submit" variant="primary">
        ↻ retry task
      </TerminalButton>
    </form>
  );
}

function DeleteButton({ taskId }: { taskId: string }) {
  async function deleteTask() {
    'use server';
    await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
    const { redirect } = await import('next/navigation');
    redirect('/tasks');
  }

  return (
    <form action={deleteTask}>
      <TerminalButton type="submit" variant="destructive">
        🗑 delete
      </TerminalButton>
    </form>
  );
}
