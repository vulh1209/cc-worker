'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TerminalButton } from './terminal-ui';

interface ChatInputProps {
  taskId: string;
  sessionId: string | null;
  workerStatus: string | null;
  workerName: string | null;
}

export function ChatInput({ taskId, sessionId, workerStatus, workerName }: ChatInputProps) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const canSubmit = sessionId && workerStatus === 'ONLINE' && prompt.trim() && !isSubmitting;

  const getDisabledReason = (): string | null => {
    if (!sessionId) return 'No session available for continuation';
    if (workerStatus !== 'ONLINE') return `Worker "${workerName}" is ${workerStatus || 'unavailable'}`;
    return null;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create follow-up');
      }

      const newTask = await response.json();
      setPrompt('');
      router.push(`/tasks/${newTask.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send follow-up');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const disabledReason = getDisabledReason();

  return (
    <div className="space-y-3">
      {/* Input area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabledReason || "Continue the conversation..."}
          disabled={!!disabledReason || isSubmitting}
          className={`
            w-full px-4 py-3 text-sm rounded-md resize-none
            bg-input border border-border
            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
            placeholder:text-muted-foreground/50
            disabled:opacity-50 disabled:cursor-not-allowed
            min-h-[80px] max-h-[200px]
          `}
          rows={3}
        />

        {/* Submit button */}
        <div className="absolute bottom-3 right-3">
          <TerminalButton
            onClick={handleSubmit}
            disabled={!canSubmit}
            variant="primary"
            size="sm"
          >
            {isSubmitting ? (
              <>
                <span className="animate-pulse">...</span>
              </>
            ) : (
              <>
                send
                <span className="ml-1">▸</span>
              </>
            )}
          </TerminalButton>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          <span>✗</span>
          <span>{error}</span>
        </div>
      )}

      {/* Helper text */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {disabledReason ? (
            <span className="text-yellow-400">{disabledReason}</span>
          ) : (
            'Press Enter to send, Shift+Enter for new line'
          )}
        </span>
        {sessionId && (
          <span className="flex items-center gap-1.5">
            <span className={`status-indicator ${workerStatus === 'ONLINE' ? 'status-online' : 'status-offline'} w-1.5 h-1.5`} />
            {workerName || 'worker'}
          </span>
        )}
      </div>
    </div>
  );
}
