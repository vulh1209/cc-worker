// Custom server for Next.js with Socket.io support
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketIO } from './src/lib/websocket-server';
import { initTaskQueue } from './src/lib/task-queue';

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
  });
});
