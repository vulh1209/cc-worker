/**
 * Mock Socket.IO for testing
 */

import { vi } from 'vitest';
import type { Server as SocketIOServer, Socket } from 'socket.io';

export const createMockSocket = (): Socket => {
  return {
    id: 'mock-socket-id',
    on: vi.fn(),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
    rooms: new Set(),
    handshake: {
      auth: {},
      headers: {},
    },
  } as unknown as Socket;
};

export const createMockSocketServer = (): SocketIOServer => {
  const eventHandlers = new Map<string, Function>();

  return {
    on: vi.fn((event: string, handler: Function) => {
      eventHandlers.set(event, handler);
    }),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    // Helper to simulate client connection
    _simulateConnection: (socket?: Socket) => {
      const mockSocket = socket || createMockSocket();
      const connectionHandler = eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }
      return mockSocket;
    },
  } as unknown as SocketIOServer & { _simulateConnection: (socket?: Socket) => Socket };
};
