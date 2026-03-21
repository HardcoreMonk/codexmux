import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleConnection, gracefulShutdown } from './src/lib/terminal-server';
import { handleTimelineConnection, gracefulTimelineShutdown } from './src/lib/timeline-server';
import { checkTmux, scanSessions, applyConfig } from './src/lib/tmux';
import { initWorkspaceStore } from './src/lib/workspace-store';
import { autoResumeOnStartup } from './src/lib/auto-resume';
import { initAuthCredentials } from './src/lib/auth-credentials';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    }),
  );
};

const start = async () => {
  const credentials = initAuthCredentials();
  process.env.AUTH_PASSWORD = credentials.password;
  process.env.AUTH_TOKEN = credentials.token;

  await checkTmux();
  await scanSessions();
  await applyConfig();
  await initWorkspaceStore();
  await autoResumeOnStartup();
  await app.prepare();

  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', handleConnection);

  const timelineWss = new WebSocketServer({ noServer: true });
  timelineWss.on('connection', handleTimelineConnection);

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://localhost:${port}`);
    const cookies = parseCookies(request.headers.cookie);

    if (cookies['auth-token'] !== process.env.AUTH_TOKEN) {
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
    } else {
      upgrade(request, socket, head);
    }
  });

  const shutdown = async () => {
    gracefulShutdown();
    gracefulTimelineShutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV}`);
    console.log(`> Auth password: ${credentials.password}`);
  });
};

start();
