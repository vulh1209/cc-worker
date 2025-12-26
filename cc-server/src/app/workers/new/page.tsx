'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NewWorkerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ apiKey: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create worker');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Worker Created!</CardTitle>
            <CardDescription>
              Save the API key below. It will only be shown once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Worker Name</label>
              <p className="text-lg">{name}</p>
            </div>

            <div>
              <label className="text-sm font-medium">API Key</label>
              <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {result.apiKey}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Copy this key and add it to your worker configuration.
              </p>
            </div>

            <div className="pt-4 flex gap-2">
              <Button
                onClick={() => navigator.clipboard.writeText(result.apiKey)}
                variant="outline"
              >
                Copy API Key
              </Button>
              <Button onClick={() => router.push('/workers')}>
                Go to Workers
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add New Worker</CardTitle>
          <CardDescription>
            Create a new worker and get an API key for configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Worker Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., my-macbook-pro"
                required
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A friendly name to identify this worker.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !name.trim()}>
                {isLoading ? 'Creating...' : 'Create Worker'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
