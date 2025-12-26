'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Worker {
  id: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
}

function NewTaskForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedWorkerId = searchParams.get('workerId');

  const [prompt, setPrompt] = useState('');
  const [workerId, setWorkerId] = useState(preselectedWorkerId || '');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch workers
    fetch('/api/workers')
      .then((res) => res.json())
      .then((data) => setWorkers(data))
      .catch(console.error);
  }, []);

  const onlineWorkers = workers.filter((w) => w.status === 'ONLINE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          workerId: workerId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create task');
      }

      const task = await response.json();
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create New Task</CardTitle>
          <CardDescription>
            Send a prompt to be executed by Claude on a worker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="prompt" className="text-sm font-medium">
                Prompt
              </label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your task prompt for Claude..."
                rows={8}
                required
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This prompt will be sent to Claude for execution on the worker.
              </p>
            </div>

            <div>
              <label htmlFor="worker" className="text-sm font-medium">
                Worker (optional)
              </label>
              <select
                id="worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto-assign to available worker</option>
                {onlineWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name} ({worker.status})
                  </option>
                ))}
              </select>
              {onlineWorkers.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  No workers are online. Task will be queued.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !prompt.trim()}>
                {isLoading ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto"><Card><CardContent className="p-8 text-center">Loading...</CardContent></Card></div>}>
      <NewTaskForm />
    </Suspense>
  );
}
