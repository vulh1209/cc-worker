'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TaskLog } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TerminalButton } from './terminal-ui';

interface LiveLogViewerProps {
  taskId: string;
  initialLogs: TaskLog[];
  initialStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}

export function LiveLogViewer({ taskId, initialLogs, initialStatus }: LiveLogViewerProps) {
  const [logs, setLogs] = useState<TaskLog[]>(initialLogs);
  const [taskStatus, setTaskStatus] = useState(initialStatus);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const isActive = taskStatus === 'PENDING' || taskStatus === 'RUNNING';
  const isRunning = taskStatus === 'RUNNING';

  useEffect(() => {
    // Subscribe for PENDING and RUNNING tasks to catch logs when task starts
    if (!isActive) return;

    const socket = io({
      path: '/api/ws',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', async () => {
      console.log('Connected to log stream');
      socket.emit('subscribe:task', taskId);

      // Fetch any logs that arrived while connecting to avoid missing logs
      // during the socket connection establishment period
      try {
        const response = await fetch(`/api/tasks/${taskId}/logs`);
        if (response.ok) {
          const freshLogs = await response.json();
          setLogs(freshLogs);
        }
      } catch (error) {
        console.error('Failed to fetch initial logs:', error);
      }
    });

    socket.on('task:log', (log: TaskLog) => {
      // Update status to RUNNING when we receive first log
      setTaskStatus('RUNNING');

      // Use functional update to avoid race conditions and prevent duplicates
      setLogs((prev) => {
        // Check if log already exists (by id or timestamp)
        const exists = prev.some(
          (l) => l.id === log.id ||
            (l.timestamp === log.timestamp && l.type === log.type)
        );
        if (exists) return prev;
        return [...prev, log];
      });
    });

    // Listen for task completion/failure to update status
    socket.on('task:completed', () => {
      setTaskStatus('COMPLETED');
    });

    socket.on('task:failed', () => {
      setTaskStatus('FAILED');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from log stream');
    });

    return () => {
      socket.emit('unsubscribe:task', taskId);
      socket.disconnect();
    };
  }, [taskId, isActive]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter
    ? logs.filter((log) => log.type === filter)
    : logs;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const logCounts = {
    all: logs.length,
    THINKING: logs.filter((l) => l.type === 'THINKING').length,
    TOOL_USE: logs.filter((l) => l.type === 'TOOL_USE').length,
    TEXT: logs.filter((l) => l.type === 'TEXT').length,
    ERROR: logs.filter((l) => l.type === 'ERROR').length,
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Execution Logs
          </h3>
          {isActive && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs">
              <span className="status-indicator status-busy w-1.5 h-1.5" />
              {isRunning ? 'LIVE' : 'WAITING'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-border bg-input"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        <FilterTab
          label="all"
          count={logCounts.all}
          active={filter === null}
          onClick={() => setFilter(null)}
        />
        <FilterTab
          label="💭 thinking"
          count={logCounts.THINKING}
          active={filter === 'THINKING'}
          onClick={() => setFilter('THINKING')}
          color="purple"
        />
        <FilterTab
          label="🔧 tools"
          count={logCounts.TOOL_USE}
          active={filter === 'TOOL_USE'}
          onClick={() => setFilter('TOOL_USE')}
          color="cyan"
        />
        <FilterTab
          label="💬 text"
          count={logCounts.TEXT}
          active={filter === 'TEXT'}
          onClick={() => setFilter('TEXT')}
          color="green"
        />
        {logCounts.ERROR > 0 && (
          <FilterTab
            label="❌ errors"
            count={logCounts.ERROR}
            active={filter === 'ERROR'}
            onClick={() => setFilter('ERROR')}
            color="red"
          />
        )}
      </div>

      {/* Log Container */}
      <div className="log-viewer h-[500px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <pre className="ascii-art text-xs mb-4">{`
  ┌─────────────────┐
  │   ◇       ◇     │
  │       ___       │
  │      /   \\     │
  │     |  ⏳ |     │
  │      \\___/     │
  └─────────────────┘
            `}</pre>
            <p className="text-muted-foreground text-sm">
              {isActive ? 'Waiting for logs...' : 'No logs available'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filteredLogs.map((log, index) => (
              <LogLine
                key={log.id || index}
                log={log}
                isExpanded={expanded.has(log.id || String(index))}
                onToggle={() => toggleExpand(log.id || String(index))}
              />
            ))}
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/30">
        <span>{logs.length} log entries</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-purple-400">●</span> {logCounts.THINKING} thinking
          </span>
          <span className="flex items-center gap-1">
            <span className="text-cyan-400">●</span> {logCounts.TOOL_USE} tools
          </span>
          <span className="flex items-center gap-1">
            <span className="text-green-400">●</span> {logCounts.TEXT} text
          </span>
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: 'purple' | 'cyan' | 'green' | 'red';
}) {
  const colorClasses = {
    purple: 'text-purple-400',
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    red: 'text-red-400',
  };

  return (
    <button
      onClick={onClick}
      className={`
        px-2 py-1 text-xs rounded border transition-colors
        ${active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground hover:border-border'
        }
      `}
    >
      {label}
      <span className={color ? colorClasses[color] : 'text-muted-foreground'}>
        {' '}{count}
      </span>
    </button>
  );
}

function LogLine({
  log,
  isExpanded,
  onToggle,
}: {
  log: TaskLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLogConfig = (type: string) => {
    const configs: Record<string, { icon: string; color: string; borderColor: string }> = {
      SYSTEM: { icon: '◈', color: 'text-muted-foreground', borderColor: 'border-l-gray-500' },
      TEXT: { icon: '💬', color: 'text-foreground', borderColor: 'border-l-green-500' },
      THINKING: { icon: '💭', color: 'text-purple-400', borderColor: 'border-l-purple-500' },
      TOOL_USE: { icon: '🔧', color: 'text-cyan-400', borderColor: 'border-l-cyan-500' },
      TOOL_RESULT: { icon: '📤', color: 'text-green-400', borderColor: 'border-l-green-500' },
      ERROR: { icon: '❌', color: 'text-red-400', borderColor: 'border-l-red-500' },
    };
    return configs[type] || configs.SYSTEM;
  };

  const formatContent = (log: TaskLog): { summary: string; detail?: string } => {
    const content = log.content as Record<string, unknown>;

    switch (log.type) {
      case 'SYSTEM':
        return { summary: String(content.message || JSON.stringify(content)) };

      case 'TEXT':
        return { summary: String(content.text || JSON.stringify(content)) };

      case 'THINKING':
        const thinking = String(content.thinking || '');
        return {
          summary: thinking.substring(0, 100) + (thinking.length > 100 ? '...' : ''),
          detail: thinking.length > 100 ? thinking : undefined,
        };

      case 'TOOL_USE':
        const tool = content.tool as string;
        const input = content.input as Record<string, unknown>;
        let summary = tool;
        if (input?.file_path) summary += `: ${input.file_path}`;
        else if (input?.command) summary += `: ${String(input.command).substring(0, 50)}`;
        else if (input?.pattern) summary += `: ${input.pattern}`;
        return {
          summary,
          detail: JSON.stringify(input, null, 2),
        };

      case 'TOOL_RESULT':
        const result = content.result;
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        return {
          summary: resultStr.substring(0, 80) + (resultStr.length > 80 ? '...' : ''),
          detail: resultStr.length > 80 ? resultStr : undefined,
        };

      case 'ERROR':
        return {
          summary: String(content.message || JSON.stringify(content)),
        };

      default:
        return { summary: JSON.stringify(content) };
    }
  };

  const config = getLogConfig(log.type);
  const { summary, detail } = formatContent(log);
  const hasDetail = !!detail;

  return (
    <div
      className={`log-line ${config.borderColor} border-l-2 py-2 ${hasDetail ? 'cursor-pointer' : ''}`}
      onClick={hasDetail ? onToggle : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <span className="text-xs text-muted-foreground/60 flex-shrink-0 w-20 tabular-nums">
          {formatTimestamp(log.timestamp)}
        </span>

        {/* Icon */}
        <span className="flex-shrink-0 w-5 text-center">{config.icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {log.type === 'TEXT' ? (
            <div className={`${config.color} log-markdown`}>
              <MarkdownRenderer content={summary} />
            </div>
          ) : log.type === 'THINKING' ? (
            <span className={`${config.color} italic`}>{summary}</span>
          ) : (
            <span className={config.color}>{summary}</span>
          )}

          {/* Expandable detail */}
          {hasDetail && isExpanded && (
            <div className="mt-2 p-3 rounded bg-secondary/30 border border-border/30 overflow-x-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                {detail}
              </pre>
            </div>
          )}
        </div>

        {/* Expand indicator */}
        {hasDetail && (
          <span className="text-muted-foreground/50 text-xs flex-shrink-0">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>
    </div>
  );
}
