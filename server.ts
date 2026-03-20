import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleConnection, gracefulShutdown } from './src/lib/terminal-server';
import { checkTmux, scanSessions } from './src/lib/tmux';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const start = async () => {
  await checkTmux();
  await scanSessions();
  await app.prepare();

  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', handleConnection);

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/api/terminal')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      upgrade(request, socket, head);
    }
  });

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  server.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV}`);
  });
};

start();
