'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SharedUser {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  sharedAt: Date;
}

interface ShareWorkerSectionProps {
  workerId: string;
  sharedWith: SharedUser[];
}

export function ShareWorkerSection({ workerId, sharedWith }: ShareWorkerSectionProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/workers/${workerId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to share');
      }

      setEmail('');
      setSuccess(`Worker shared with ${email}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveShare = async (userId: string, userEmail: string) => {
    if (!confirm(`Remove sharing with ${userEmail}?`)) return;

    try {
      const response = await fetch(`/api/workers/${workerId}/share?userId=${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove share');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sharing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Share Form */}
        <form onSubmit={handleShare} className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email to share with..."
            className="flex-1"
            required
          />
          <Button type="submit" disabled={isLoading || !email}>
            {isLoading ? 'Sharing...' : 'Share'}
          </Button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        {/* Shared Users List */}
        {sharedWith.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Shared with {sharedWith.length} user{sharedWith.length > 1 ? 's' : ''}
            </p>
            <div className="divide-y">
              {sharedWith.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {share.user.name || share.user.email}
                    </p>
                    {share.user.name && (
                      <p className="text-xs text-muted-foreground">
                        {share.user.email}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveShare(share.user.id, share.user.email)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            This worker is not shared with anyone yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
