import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';

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

// --- Server Config (~/. purple-terminal/config.json) ---

interface IServerConfig {
  mode: 'local' | 'remote';
  remoteUrl?: string;
}

interface IAppConfig {
  server?: IServerConfig;
}

const CONFIG_DIR = path.join(os.homedir(), '.purple-terminal');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const readAppConfig = (): IAppConfig => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
};

const writeAppConfig = (config: IAppConfig) => {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    fs.renameSync(tmp, CONFIG_FILE);
  } catch (err) {
    console.error('[electron] config.json 저장 실패:', err);
  }
};

const readServerConfig = (): IServerConfig => {
  const cfg = readAppConfig();
  if (cfg.server?.mode === 'remote' && cfg.server?.remoteUrl) {
    return { mode: 'remote', remoteUrl: cfg.server.remoteUrl };
  }
  return { mode: 'local' };
};

const writeServerConfig = (server: IServerConfig) => {
  const cfg = readAppConfig();
  cfg.server = server;
  writeAppConfig(cfg);
};

// --- Prompt Window ---

const showServerPrompt = (parent: BrowserWindow, currentUrl?: string): Promise<string | null> =>
  new Promise((resolve) => {
    const prompt = new BrowserWindow({
      width: 420,
      height: 180,
      parent,
      modal: true,
      resizable: false,
      show: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: '#09090b',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const escaped = (currentUrl || 'http://').replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>서버 연결</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#09090b;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px}
label{display:block;margin-bottom:8px;font-size:13px;color:#a1a1aa}
input{width:100%;padding:8px 12px;border:1px solid #27272a;border-radius:6px;background:#18181b;color:#fafafa;font-size:14px;outline:none}
input:focus{border-color:#7c3aed}
.buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
button{padding:6px 16px;border-radius:6px;border:1px solid #27272a;font-size:13px;cursor:pointer}
.cancel{background:#27272a;color:#fafafa}.cancel:hover{background:#3f3f46}
.connect{background:#7c3aed;color:#fff;border-color:#7c3aed}.connect:hover{background:#6d28d9}
</style></head><body>
<label>서버 주소</label>
<input id="url" value="${escaped}" placeholder="http://192.168.1.100:8022"/>
<div class="buttons">
<button class="cancel" id="cancelBtn">취소</button>
<button class="connect" id="connectBtn">연결</button>
</div>
<script>
var input=document.getElementById('url');
input.focus();input.select();
document.getElementById('cancelBtn').onclick=function(){window.close()};
document.getElementById('connectBtn').onclick=function(){
  var v=input.value.trim();
  if(v){document.title='CONNECT:'+v;window.close()}
};
input.onkeydown=function(e){
  if(e.key==='Enter')document.getElementById('connectBtn').click();
  if(e.key==='Escape')window.close();
};
</script></body></html>`;

    let result: string | null = null;

    prompt.webContents.on('page-title-updated', (_e, title) => {
      if (title.startsWith('CONNECT:')) {
        result = title.slice('CONNECT:'.length);
      }
    });

    prompt.on('closed', () => resolve(result));
    prompt.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    prompt.once('ready-to-show', () => prompt.show());
  });

// --- State ---

let mainWindow: BrowserWindow | null = null;
let serverShutdown: (() => Promise<void>) | null = null;
let serverConfig: IServerConfig = { mode: 'local' };
let localPort: number | null = null;
let cachedStart: ((opts: { port: number }) => Promise<{ port: number; shutdown: () => Promise<void> }>) | null = null;

// --- Local Server ---

const startLocalServer = async (): Promise<number> => {
  if (!cachedStart) {
    const mod = await import(path.join(process.env.__PT_APP_DIR!, 'dist', 'server.js'));
    cachedStart = mod.start;
  }
  const port = await findFreePort(8022);
  const result = await cachedStart!({ port });
  serverShutdown = result.shutdown;
  localPort = result.port;
  return result.port;
};

const stopLocalServer = async () => {
  if (serverShutdown) {
    await serverShutdown();
    serverShutdown = null;
    localPort = null;
  }
};

// --- Menu ---

const getServerLabel = (): string => {
  if (serverConfig.mode === 'remote') return serverConfig.remoteUrl || '';
  return localPort ? `localhost:${localPort}` : 'localhost';
};

const updateMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: `서버: ${getServerLabel()}`, enabled: false },
        { label: '로컬 서버 사용', type: 'radio', checked: serverConfig.mode === 'local', click: handleSwitchToLocal },
        { label: '원격 서버 연결...', type: 'radio', checked: serverConfig.mode === 'remote', click: handleSwitchToRemote },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// --- Server Switching ---

const handleSwitchToLocal = async () => {
  if (serverConfig.mode === 'local') return;

  serverConfig = { mode: 'local' };
  writeServerConfig(serverConfig);

  try {
    const port = await startLocalServer();
    mainWindow?.loadURL(`http://localhost:${port}`);
  } catch (err) {
    console.error('[electron] 로컬 서버 시작 실패:', err);
  }
  updateMenu();
};

const handleSwitchToRemote = async () => {
  if (!mainWindow) return;

  const url = await showServerPrompt(mainWindow, serverConfig.remoteUrl);
  if (!url) {
    updateMenu();
    return;
  }

  await stopLocalServer();
  serverConfig = { mode: 'remote', remoteUrl: url };
  writeServerConfig(serverConfig);
  mainWindow.loadURL(url);
  updateMenu();
};

// --- Window ---

const createWindow = (url: string) => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 4 },
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

// --- Bootstrap ---

const bootstrap = async () => {
  fixPath();

  if (devUrl) {
    createWindow(devUrl);
    return;
  }

  process.env.NODE_ENV = 'production';
  process.env.__PT_ELECTRON = '1';
  process.env.__PT_APP_DIR = isDev ? process.cwd() : app.getAppPath();

  serverConfig = readServerConfig();

  if (serverConfig.mode === 'remote' && serverConfig.remoteUrl) {
    createWindow(serverConfig.remoteUrl);
  } else {
    serverConfig = { mode: 'local' };
    const port = await startLocalServer();
    createWindow(`http://localhost:${port}`);
  }

  updateMenu();
};

ipcMain.handle('open-external', (_event, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

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
