'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TaskLog } from '@/types';

interface LiveLogViewerProps {
  taskId: string;
  initialLogs: TaskLog[];
  isRunning: boolean;
}

export function LiveLogViewer({ taskId, initialLogs, isRunning }: LiveLogViewerProps) {
  const [logs, setLogs] = useState<TaskLog[]>(initialLogs);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    // Connect to WebSocket
    const socket = io({
      path: '/api/ws',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to log stream');
      socket.emit('subscribe:task', taskId);
    });

    socket.on('task:log', (log: TaskLog) => {
      setLogs((prev) => [...prev, log]);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from log stream');
    });

    return () => {
      socket.emit('unsubscribe:task', taskId);
      socket.disconnect();
    };
  }, [taskId, isRunning]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'SYSTEM':
        return '📋';
      case 'TEXT':
        return '💬';
      case 'THINKING':
        return '💭';
      case 'TOOL_USE':
        return '🔧';
      case 'TOOL_RESULT':
        return '📤';
      case 'ERROR':
        return '❌';
      default:
        return '•';
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'SYSTEM':
        return 'text-blue-400';
      case 'TEXT':
        return 'text-gray-200';
      case 'THINKING':
        return 'text-purple-400';
      case 'TOOL_USE':
        return 'text-yellow-400';
      case 'TOOL_RESULT':
        return 'text-green-400';
      case 'ERROR':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatContent = (log: TaskLog): string => {
    const content = log.content as Record<string, unknown>;

    switch (log.type) {
      case 'SYSTEM':
        return String(content.message || JSON.stringify(content));

      case 'TEXT':
        return String(content.text || JSON.stringify(content));

      case 'THINKING':
        return String(content.thinking || JSON.stringify(content));

      case 'TOOL_USE':
        const tool = content.tool as string;
        const input = content.input;
        if (typeof input === 'object' && input !== null) {
          const inputObj = input as Record<string, unknown>;
          if (inputObj.file_path) {
            return `${tool}: ${inputObj.file_path}`;
          }
          if (inputObj.command) {
            return `${tool}: ${String(inputObj.command).substring(0, 80)}...`;
          }
          if (inputObj.pattern) {
            return `${tool}: ${inputObj.pattern}`;
          }
        }
        return `${tool}: ${JSON.stringify(input).substring(0, 100)}`;

      case 'TOOL_RESULT':
        const result = content.result;
        if (content.isError) {
          return `Error: ${result}`;
        }
        return typeof result === 'string'
          ? result.substring(0, 200) + (String(result).length > 200 ? '...' : '')
          : JSON.stringify(result).substring(0, 200);

      case 'ERROR':
        return String(content.message || JSON.stringify(content));

      default:
        return JSON.stringify(content);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Logs {isRunning && <span className="text-yellow-500">(Live)</span>}
        </h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
        {logs.length === 0 ? (
          <p className="text-gray-500">Waiting for logs...</p>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id || index}
              className={`flex gap-2 py-1 ${getLogColor(log.type)}`}
            >
              <span className="text-gray-500 flex-shrink-0">
                [{formatTimestamp(log.timestamp)}]
              </span>
              <span className="flex-shrink-0">{getLogIcon(log.type)}</span>
              <span className="break-all">{formatContent(log)}</span>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
