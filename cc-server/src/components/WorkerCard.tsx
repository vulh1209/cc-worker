'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  os: string | null;
  hostname: string | null;
  lastSeen: Date | null;
  _count?: {
    tasks: number;
  };
}

interface WorkerCardProps {
  worker: Worker;
}

export function WorkerCard({ worker }: WorkerCardProps) {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span>{statusIcons[worker.status]}</span>
            {worker.name}
          </CardTitle>
          <Badge variant={statusColors[worker.status]}>{worker.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-1 text-sm text-muted-foreground">
          {worker.os && <p>{worker.os}</p>}
          {worker.hostname && <p>Host: {worker.hostname}</p>}
          <p>Last seen: {formatRelativeTime(worker.lastSeen)}</p>
          {worker._count && <p>Tasks: {worker._count.tasks}</p>}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Link href={`/workers/${worker.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            View Details
          </Button>
        </Link>
        {worker.status === 'ONLINE' && (
          <Link href={`/tasks/new?workerId=${worker.id}`} className="flex-1">
            <Button size="sm" className="w-full">
              Send Task
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
