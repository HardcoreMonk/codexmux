import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { getToken } from 'next-auth/jwt';
import { handleConnection, gracefulShutdown } from './src/lib/terminal-server';
import { handleTimelineConnection, gracefulTimelineShutdown } from './src/lib/timeline-server';
import { handleSyncConnection, gracefulSyncShutdown } from './src/lib/sync-server';
import { handleStatusConnection, gracefulStatusShutdown } from './src/lib/status-server';
import { getStatusManager } from './src/lib/status-manager';
import { ensureHookSettings } from './src/lib/hook-settings';
import { scanSessions, applyConfig } from './src/lib/tmux';
import { initWorkspaceStore } from './src/lib/workspace-store';
import { autoResumeOnStartup } from './src/lib/auto-resume';
import { initAuthCredentials } from './src/lib/auth-credentials';
import type { IncomingMessage } from 'http';

const dev = process.env.NODE_ENV !== 'production';

const extractCookie = (header: string, name: string): string | undefined => {
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq !== -1 && trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
};

const SESSION_COOKIE = 'next-auth.session-token';

const verifyWebSocketAuth = async (request: IncomingMessage): Promise<boolean> => {
  const value = extractCookie(request.headers.cookie ?? '', SESSION_COOKIE);
  const token = await getToken({
    req: { headers: request.headers, cookies: { [SESSION_COOKIE]: value ?? '' } } as never,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: SESSION_COOKIE,
  });
  return !!token;
};

interface IStartOptions {
  port?: number;
}

interface IStartResult {
  port: number;
  shutdown: () => Promise<void>;
}

export const start = async (opts?: IStartOptions): Promise<IStartResult> => {
  const port = opts?.port ?? parseInt(process.env.PORT || '8022', 10);
  const appDir = process.env.__PMUX_APP_DIR || process.cwd();
  const app = next({ dev, dir: appDir });
  const handle = app.getRequestHandler();

  const credentials = initAuthCredentials();
  process.env.AUTH_PASSWORD = credentials.password;
  process.env.NEXTAUTH_SECRET = credentials.secret;

  await scanSessions();
  await applyConfig();
  await initWorkspaceStore();
  await autoResumeOnStartup();
  await ensureHookSettings();
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
    gracefulTimelineShutdown();
    gracefulSyncShutdown();
    gracefulStatusShutdown();
    server.close();
    await gracefulShutdown();
  };

  const exitGracefully = async () => {
    await shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', exitGracefully);
  process.on('SIGINT', exitGracefully);

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV}`);
      console.log(`> Auth password: ${credentials.password}${credentials.fixed ? ' (fixed)' : ''}`);
      resolve();
    });
  });

  return { port, shutdown };
};

if (!process.env.__PMUX_ELECTRON) {
  start();
}
