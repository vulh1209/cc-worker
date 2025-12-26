'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TerminalCard,
  TerminalWindow,
  TerminalButton,
  StatusBadge,
} from '@/components/terminal-ui';

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
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="text-primary">+</span>
          New Task
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="terminal-prompt">create a new Claude task</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Prompt Input */}
        <TerminalWindow title="prompt.txt">
          <div className="space-y-3">
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your task prompt for Claude..."
              rows={12}
              required
              className="terminal-input w-full resize-none"
              style={{ minHeight: '200px' }}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {prompt.length} characters
              </span>
              <span>
                Markdown supported
              </span>
            </div>
          </div>
        </TerminalWindow>

        {/* Worker Selection */}
        <TerminalCard title="Worker Assignment">
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">
                Select Worker (optional)
              </label>
              <select
                id="worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="terminal-input"
              >
                <option value="">Auto-assign to available worker</option>
                {onlineWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name} ({worker.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Worker Status */}
            <div className="pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-3">
                Available Workers
              </p>
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Loading workers...
                </p>
              ) : onlineWorkers.length === 0 ? (
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                  <span className="status-indicator status-busy" />
                  No workers online. Task will be queued.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {workers.map((worker) => (
                    <button
                      key={worker.id}
                      type="button"
                      onClick={() => setWorkerId(worker.id)}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded border text-sm transition-colors
                        ${workerId === worker.id
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-secondary/30 border-border/30 text-muted-foreground hover:border-border hover:text-foreground'
                        }
                        ${worker.status !== 'ONLINE' && 'opacity-50 cursor-not-allowed'}
                      `}
                      disabled={worker.status !== 'ONLINE'}
                    >
                      <span
                        className={`status-indicator w-2 h-2 ${
                          worker.status === 'ONLINE'
                            ? 'status-online'
                            : worker.status === 'BUSY'
                            ? 'status-busy'
                            : 'status-offline'
                        }`}
                      />
                      {worker.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TerminalCard>

        {/* Error */}
        {error && (
          <TerminalCard className="border-red-500/30">
            <div className="flex items-center gap-2 text-red-400">
              <span>❌</span>
              <span className="text-sm">{error}</span>
            </div>
          </TerminalCard>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <TerminalButton
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            ← cancel
          </TerminalButton>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {onlineWorkers.length} worker{onlineWorkers.length !== 1 ? 's' : ''} online
            </span>
            <TerminalButton
              type="submit"
              variant="primary"
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">◌</span>
                  creating...
                </>
              ) : (
                <>
                  <span>▶</span>
                  create task
                </>
              )}
            </TerminalButton>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto">
          <TerminalCard>
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <span className="text-2xl animate-spin inline-block">◌</span>
                <p className="text-muted-foreground mt-2">Loading...</p>
              </div>
            </div>
          </TerminalCard>
        </div>
      }
    >
      <NewTaskForm />
    </Suspense>
  );
}
