// Custom server for Next.js with Socket.io support
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketIO } from './src/lib/websocket-server';
import { initTaskQueue } from './src/lib/task-queue';
import { cleanupExpiredSessions } from './src/lib/auth';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io
  initSocketIO(httpServer);

  // Initialize Task Queue
  initTaskQueue();

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server running on ws://${hostname}:${port}/api/ws`);
    console.log(`> Task queue processor started`);

    // Cleanup expired sessions every hour
    setInterval(async () => {
      try {
        const count = await cleanupExpiredSessions();
        if (count > 0) {
          console.log(`> Cleaned up ${count} expired sessions`);
        }
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
    console.log(`> Session cleanup scheduled (hourly)`);
  });
});
