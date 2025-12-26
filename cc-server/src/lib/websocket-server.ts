import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { initWorkerManager } from './worker-manager';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    path: '/api/ws',
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? false
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Initialize worker manager
  initWorkerManager(io);

  console.log('[WebSocket] Server initialized');

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
