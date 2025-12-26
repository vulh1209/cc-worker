import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { WorkerCard } from '@/components/WorkerCard';
import prisma from '@/lib/prisma';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workers</h1>
          <p className="text-muted-foreground">
            {workers.length} workers total &bull; {onlineCount} online &bull;{' '}
            {busyCount} busy
          </p>
        </div>
        <Link href="/workers/new">
          <Button>Add Worker</Button>
        </Link>
      </div>

      {workers.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No workers yet</h3>
          <p className="text-muted-foreground mt-1">
            Add a worker to get started with task distribution.
          </p>
          <Link href="/workers/new" className="mt-4 inline-block">
            <Button>Add Your First Worker</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
