import Link from 'next/link';
import {
  TerminalCard,
  StatusBadge,
  EmptyState,
  TerminalButton,
  ProgressBar,
} from '@/components/terminal-ui';
import prisma from '@/lib/prisma';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getWorkers() {
  return prisma.worker.findMany({
    orderBy: [
      { status: 'asc' }, // ONLINE first
      { lastSeen: 'desc' },
    ],
    include: {
      _count: {
        select: { tasks: true },
      },
    },
  });
}

export default async function WorkersPage() {
  const workers = await getWorkers();

  const onlineCount = workers.filter((w) => w.status === 'ONLINE').length;
  const busyCount = workers.filter((w) => w.status === 'BUSY').length;
  const offlineCount = workers.filter((w) => w.status === 'OFFLINE').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">⬡</span>
            Workers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="terminal-prompt">
              {workers.length} registered · {onlineCount} online · {busyCount} busy
            </span>
          </p>
        </div>
        <Link href="/workers/new">
          <TerminalButton variant="primary">
            <span className="text-xs mr-1">+</span>
            add worker
          </TerminalButton>
        </Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2">
        <StatusTab count={workers.length} label="all" active />
        <StatusTab count={onlineCount} label="online" color="green" />
        <StatusTab count={busyCount} label="busy" color="yellow" />
        <StatusTab count={offlineCount} label="offline" color="gray" />
      </div>

      {/* Workers Grid */}
      {workers.length === 0 ? (
        <TerminalCard>
          <EmptyState
            type="workers"
            title="No workers registered"
            description="Add a worker to start distributing Claude tasks across your infrastructure."
            action={
              <Link href="/workers/new">
                <TerminalButton variant="primary">
                  add your first worker
                </TerminalButton>
              </Link>
            }
          />
        </TerminalCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker, index) => (
            <WorkerGridCard
              key={worker.id}
              worker={worker}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusTab({
  count,
  label,
  color,
  active = false,
}: {
  count: number;
  label: string;
  color?: 'green' | 'yellow' | 'gray';
  active?: boolean;
}) {
  const colorClasses = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    gray: 'text-gray-400',
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
          <span className={`status-indicator w-1.5 h-1.5 ${
            color === 'green' ? 'status-online' :
            color === 'yellow' ? 'status-busy' :
            'status-offline'
          }`} />
        )}
        <span>{label}</span>
        <span className={color ? colorClasses[color] : ''}>{count}</span>
      </span>
    </button>
  );
}

function WorkerGridCard({
  worker,
  index,
}: {
  worker: {
    id: string;
    name: string;
    status: string;
    os: string | null;
    hostname: string | null;
    lastSeen: Date | null;
    isOrchestrator?: boolean;
    _count?: { tasks: number };
  };
  index: number;
}) {
  const isOnline = worker.status === 'ONLINE';
  const isBusy = worker.status === 'BUSY';
  const isOrchestrator = worker.isOrchestrator;

  return (
    <div
      className="block animate-slide-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <TerminalCard className="h-full hover:border-primary/30 transition-all group">
        {/* Clickable area for navigation - using Link properly */}
        <Link href={`/workers/${worker.id}`} className="block">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span
                className={`status-indicator ${
                  isOnline ? 'status-online' :
                  isBusy ? 'status-busy' :
                  'status-offline'
                }`}
              />
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                  {worker.name}
                  {isOrchestrator && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      🎯 orchestrator
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {worker.hostname || 'unknown host'}
                </p>
              </div>
            </div>
            <StatusBadge status={worker.status as any} size="sm" showDot={false} />
          </div>

          {/* Info Grid */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">OS</span>
              <span className="text-foreground">{worker.os || 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tasks</span>
              <span className="text-foreground tabular-nums">{worker._count?.tasks || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last seen</span>
              <span className="text-foreground">
                {formatRelativeTime(worker.lastSeen)}
              </span>
            </div>
          </div>

          {/* Status Bar */}
          {isBusy && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-yellow-400">executing task...</span>
                <span className="text-muted-foreground animate-pulse">●</span>
              </div>
              <ProgressBar value={50} color="yellow" striped size="sm" />
            </div>
          )}
        </Link>

        {/* Actions - outside of Link to avoid nested links */}
        <div className="mt-4 pt-4 border-t border-border/30 flex gap-2">
          <Link href={`/workers/${worker.id}`} className="flex-1">
            <TerminalButton variant="ghost" size="sm" className="w-full">
              view details
            </TerminalButton>
          </Link>
          {isOnline && (
            <Link href={`/tasks/new?workerId=${worker.id}`} className="flex-1">
              <TerminalButton variant="primary" size="sm" className="w-full">
                send task
              </TerminalButton>
            </Link>
          )}
        </div>
      </TerminalCard>
    </div>
  );
}
