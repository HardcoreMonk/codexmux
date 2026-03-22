import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { getToken } from 'next-auth/jwt';
import { handleConnection, gracefulShutdown } from './src/lib/terminal-server';
import { handleTimelineConnection, gracefulTimelineShutdown } from './src/lib/timeline-server';
import { handleSyncConnection, gracefulSyncShutdown } from './src/lib/sync-server';
import { handleStatusConnection, gracefulStatusShutdown } from './src/lib/status-server';
import { getStatusManager } from './src/lib/status-manager';
import { scanSessions, applyConfig } from './src/lib/tmux';
import { initWorkspaceStore } from './src/lib/workspace-store';
import { autoResumeOnStartup } from './src/lib/auto-resume';
import { initAuthCredentials } from './src/lib/auth-credentials';
import type { IncomingMessage } from 'http';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const verifyWebSocketAuth = async (request: IncomingMessage): Promise<boolean> => {
  const token = await getToken({
    req: request as never,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: 'next-auth.session-token',
  });
  return !!token;
};

const start = async () => {
  const credentials = initAuthCredentials();
  process.env.AUTH_PASSWORD = credentials.password;
  process.env.NEXTAUTH_SECRET = credentials.secret;

  await scanSessions();
  await applyConfig();
  await initWorkspaceStore();
  await autoResumeOnStartup();
  await getStatusManager().init();
  await app.prepare();

  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', handleConnection);

  const timelineWss = new WebSocketServer({ noServer: true });
  timelineWss.on('connection', handleTimelineConnection);

  const syncWss = new WebSocketServer({ noServer: true });
  syncWss.on('connection', handleSyncConnection);

  const statusWss = new WebSocketServer({ noServer: true });
  statusWss.on('connection', handleStatusConnection);

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://localhost:${port}`);

    if (dev && url.pathname.startsWith('/_next/')) {
      upgrade(request, socket, head);
      return;
    }

    const authenticated = await verifyWebSocketAuth(request);
    if (!authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (url.pathname === '/api/terminal') {
      const sessionId = url.searchParams.get('session');
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, sessionId);
      });
    } else if (url.pathname === '/api/timeline') {
      timelineWss.handleUpgrade(request, socket, head, (ws) => {
        timelineWss.emit('connection', ws, request);
      });
    } else if (url.pathname === '/api/sync') {
      syncWss.handleUpgrade(request, socket, head, (ws) => {
        syncWss.emit('connection', ws);
      });
    } else if (url.pathname === '/api/status') {
      statusWss.handleUpgrade(request, socket, head, (ws) => {
        statusWss.emit('connection', ws);
      });
    } else {
      upgrade(request, socket, head);
    }
  });

  const shutdown = async () => {
    gracefulShutdown();
    gracefulTimelineShutdown();
    gracefulSyncShutdown();
    gracefulStatusShutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV}`);
    console.log(`> Auth password: ${credentials.password}${credentials.fixed ? ' (fixed)' : ''}`);
  });
};

start();
