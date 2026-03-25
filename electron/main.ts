import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as net from 'net';

const isDev = process.env.NODE_ENV === 'development';
const devUrl = process.env.ELECTRON_DEV_URL;

const fixPath = () => {
  const additions = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const current = process.env.PATH || '';
  const parts = current.split(':');
  for (const dir of additions) {
    if (!parts.includes(dir)) parts.unshift(dir);
  }
  process.env.PATH = parts.join(':');
};

const findFreePort = (startPort: number): Promise<number> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      server.close(() => resolve(startPort));
    });
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
  });

let mainWindow: BrowserWindow | null = null;
let serverShutdown: (() => Promise<void>) | null = null;

const createWindow = (url: string) => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    shell.openExternal(linkUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const bootstrap = async () => {
  fixPath();

  if (devUrl) {
    createWindow(devUrl);
    return;
  }

  process.env.NODE_ENV = 'production';
  process.env.__PT_ELECTRON = '1';
  process.env.__PT_APP_DIR = isDev ? process.cwd() : path.join(app.getAppPath(), '..');

  const port = await findFreePort(8022);
  const { start } = await import(path.join(process.env.__PT_APP_DIR, 'dist', 'server.js'));
  const result = await start({ port });
  serverShutdown = result.shutdown;

  createWindow(`http://localhost:${result.port}`);
};

app.on('ready', bootstrap);

app.on('activate', () => {
  if (mainWindow === null && !devUrl) {
    bootstrap();
  }
});

app.on('window-all-closed', async () => {
  if (serverShutdown) {
    await serverShutdown();
  }
  app.quit();
});

app.requestSingleInstanceLock();
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
