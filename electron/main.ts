import { app, BrowserWindow, shell, Menu, ipcMain, session, screen, Notification, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { pickTaglines } from './splash-taglines';

const isDev = process.env.NODE_ENV === 'development';
const devUrl = process.env.ELECTRON_DEV_URL;

const fixEnv = () => {
  const additions = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const current = process.env.PATH || '';
  const parts = current.split(':');
  for (const dir of additions) {
    if (!parts.includes(dir)) parts.unshift(dir);
  }
  process.env.PATH = parts.join(':');

  // Finder/Dock에서 실행 시 locale 환경변수가 없어 Nerd Font 글리프가 깨짐
  if (!process.env.LANG) {
    process.env.LANG = 'en_US.UTF-8';
  }
};

// --- Server Config (~/.purplemux/config.json) ---

interface IServerConfig {
  mode: 'local' | 'remote';
  remoteUrl?: string;
}

interface IWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
  isFullScreen?: boolean;
  displayId?: number;
}

interface IAppConfig {
  server?: IServerConfig;
  windowState?: IWindowState;
  appTheme?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.purplemux');
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
    console.error('[electron] Failed to save config.json:', err);
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

// --- Window State ---

const DEFAULT_WINDOW_STATE: IWindowState = { width: 1280, height: 800 };

const readWindowState = (): IWindowState => {
  const cfg = readAppConfig();
  return cfg.windowState || DEFAULT_WINDOW_STATE;
};

const writeWindowState = (state: IWindowState) => {
  const cfg = readAppConfig();
  cfg.windowState = state;
  writeAppConfig(cfg);
};

const isVisibleOnAnyDisplay = (bounds: { x: number; y: number; width: number; height: number }): boolean => {
  const displays = screen.getAllDisplays();
  const MIN_OVERLAP = 50;
  return displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, x + width) - Math.max(bounds.x, x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, y + height) - Math.max(bounds.y, y));
    return overlapX >= MIN_OVERLAP && overlapY >= MIN_OVERLAP;
  });
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
    const m = mt();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${m.serverConnection}</title><style>
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
<label>${m.serverAddress}</label>
<input id="url" value="${escaped}" placeholder="http://192.168.1.100:8022"/>
<div class="buttons">
<button class="cancel" id="cancelBtn">${m.cancel}</button>
<button class="connect" id="connectBtn">${m.connect}</button>
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

// --- i18n ---

interface IMenuMessages {
  server: string;
  useLocalServer: string;
  connectRemoteServer: string;
  serverConnection: string;
  serverAddress: string;
  cancel: string;
  connect: string;
}

const menuMessages: Record<string, IMenuMessages> = {
  en: { server: 'Server', useLocalServer: 'Use Local Server', connectRemoteServer: 'Connect to Remote Server…', serverConnection: 'Server Connection', serverAddress: 'Server Address', cancel: 'Cancel', connect: 'Connect' },
  ko: { server: '서버', useLocalServer: '로컬 서버 사용', connectRemoteServer: '원격 서버 연결…', serverConnection: '서버 연결', serverAddress: '서버 주소', cancel: '취소', connect: '연결' },
  ja: { server: 'サーバー', useLocalServer: 'ローカルサーバーを使用', connectRemoteServer: 'リモートサーバーに接続…', serverConnection: 'サーバー接続', serverAddress: 'サーバーアドレス', cancel: 'キャンセル', connect: '接続' },
  'zh-CN': { server: '服务器', useLocalServer: '使用本地服务器', connectRemoteServer: '连接远程服务器…', serverConnection: '服务器连接', serverAddress: '服务器地址', cancel: '取消', connect: '连接' },
  'zh-TW': { server: '伺服器', useLocalServer: '使用本機伺服器', connectRemoteServer: '連線遠端伺服器…', serverConnection: '伺服器連線', serverAddress: '伺服器位址', cancel: '取消', connect: '連線' },
  es: { server: 'Servidor', useLocalServer: 'Usar servidor local', connectRemoteServer: 'Conectar a servidor remoto…', serverConnection: 'Conexión al servidor', serverAddress: 'Dirección del servidor', cancel: 'Cancelar', connect: 'Conectar' },
  de: { server: 'Server', useLocalServer: 'Lokalen Server verwenden', connectRemoteServer: 'Mit Remote-Server verbinden…', serverConnection: 'Serververbindung', serverAddress: 'Serveradresse', cancel: 'Abbrechen', connect: 'Verbinden' },
  fr: { server: 'Serveur', useLocalServer: 'Utiliser le serveur local', connectRemoteServer: 'Se connecter à un serveur distant…', serverConnection: 'Connexion au serveur', serverAddress: 'Adresse du serveur', cancel: 'Annuler', connect: 'Connecter' },
  'pt-BR': { server: 'Servidor', useLocalServer: 'Usar servidor local', connectRemoteServer: 'Conectar a servidor remoto…', serverConnection: 'Conexão com servidor', serverAddress: 'Endereço do servidor', cancel: 'Cancelar', connect: 'Conectar' },
  ru: { server: 'Сервер', useLocalServer: 'Использовать локальный сервер', connectRemoteServer: 'Подключиться к удалённому серверу…', serverConnection: 'Подключение к серверу', serverAddress: 'Адрес сервера', cancel: 'Отмена', connect: 'Подключить' },
  tr: { server: 'Sunucu', useLocalServer: 'Yerel sunucuyu kullan', connectRemoteServer: 'Uzak sunucuya bağlan…', serverConnection: 'Sunucu bağlantısı', serverAddress: 'Sunucu adresi', cancel: 'İptal', connect: 'Bağlan' },
};

let currentLocale = 'en';

const mt = (): IMenuMessages => menuMessages[currentLocale] || menuMessages.en;

const readLocaleFromConfig = (): string => {
  const cfg = readAppConfig();
  return (cfg as Record<string, unknown>).locale as string || 'en';
};

// --- State ---

let mainWindow: BrowserWindow | null = null;
let serverShutdown: (() => Promise<void>) | null = null;
let isQuitting = false;
let serverConfig: IServerConfig = { mode: 'local' };
let localPort: number | null = null;
let cachedStart: ((opts: { port: number }) => Promise<{ port: number; shutdown: () => Promise<void> }>) | null = null;

// --- Local Server ---

const DEFAULT_PORT = 8022;

const startLocalServer = async (): Promise<number> => {
  if (!cachedStart) {
    const appDir = process.env.__PMUX_APP_DIR!;
    const appDirUnpacked = process.env.__PMUX_APP_DIR_UNPACKED || appDir;
    const standaloneMods = path.join(appDir, '.next', 'standalone', 'node_modules');
    process.env.NODE_PATH = [standaloneMods, process.env.NODE_PATH].filter(Boolean).join(':');
    require('module').Module._initPaths(); // eslint-disable-line @typescript-eslint/no-require-imports
    const mod = await import(path.join(appDir, 'dist', 'server.js'));
    cachedStart = mod.start;
  }
  let result;
  try {
    result = await cachedStart!({ port: DEFAULT_PORT });
  } catch {
    result = await cachedStart!({ port: 0 });
  }
  serverShutdown = result.shutdown;
  localPort = result.port;
  process.title = 'purplemux';
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
        { label: `${mt().server}: ${getServerLabel()}`, enabled: false },
        { label: mt().useLocalServer, type: 'radio', checked: serverConfig.mode === 'local', click: handleSwitchToLocal },
        { label: mt().connectRemoteServer, type: 'radio', checked: serverConfig.mode === 'remote', click: handleSwitchToRemote },
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
    console.error('[electron] Failed to start local server:', err);
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

const getRestorePosition = (saved: IWindowState): { x?: number; y?: number } => {
  const hasPosition = saved.x != null && saved.y != null;
  if (hasPosition && isVisibleOnAnyDisplay({ x: saved.x!, y: saved.y!, width: saved.width, height: saved.height })) {
    return { x: saved.x, y: saved.y };
  }

  if (saved.displayId != null) {
    const target = screen.getAllDisplays().find((d) => d.id === saved.displayId);
    if (target) {
      const { x, y, width, height } = target.workArea;
      return {
        x: x + Math.floor((width - saved.width) / 2),
        y: y + Math.floor((height - saved.height) / 2),
      };
    }
  }

  return {};
};

const createWindow = (url: string) => {
  const saved = readWindowState();
  const pos = getRestorePosition(saved);

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...pos,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    backgroundColor: resolveIsDark() ? '#09090b' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  if (saved.isMaximized) mainWindow.maximize();
  if (saved.isFullScreen) mainWindow.setFullScreen(true);

  mainWindow.loadURL(url);

  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    shell.openExternal(linkUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const currentOrigin = new URL(mainWindow?.webContents.getURL() || '').origin;
    const targetOrigin = new URL(navigationUrl).origin;
    if (currentOrigin !== targetOrigin) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveWindowState = () => {
    if (!mainWindow) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getNormalBounds();
      const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
      writeWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: mainWindow.isMaximized(),
        isFullScreen: mainWindow.isFullScreen(),
        displayId: currentDisplay.id,
      });
    }, 500);
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);
  mainWindow.on('enter-full-screen', saveWindowState);
  mainWindow.on('leave-full-screen', saveWindowState);

  mainWindow.on('close', (e) => {
    if (!mainWindow) return;
    if (saveTimer) clearTimeout(saveTimer);
    const bounds = mainWindow.getNormalBounds();
    const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
    writeWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
      displayId: currentDisplay.id,
    });

    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// --- Splash (Loading) Screen ---

const resolveIsDark = (): boolean => {
  const cfg = readAppConfig();
  const theme = cfg.appTheme || 'dark';
  if (theme === 'system') return nativeTheme.shouldUseDarkColors;
  return theme !== 'light';
};

const buildSplashHTML = (isDark: boolean): string => {
  const bg = isDark ? '#09090b' : '#ffffff';
  const spinner = isDark ? '#a09dc0' : '#807da8';
  const text = isDark ? '#52525b' : '#a1a1aa';
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const tags = pickTaglines(8).map(escape);
  const tagsJson = "['" + tags.join("','") + "']";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${bg};display:flex;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag;font-family:'SF Mono','Fira Code','JetBrains Mono',monospace}
.container{text-align:center;user-select:none}
.spinner{font-size:20px;color:${spinner};height:28px;line-height:28px}
.word{font-size:12px;color:${text};margin-top:14px;height:20px}
</style></head><body><div class="container">
<div class="spinner" id="s"></div>
<div class="word" id="w"></div>
</div><script>
var sc=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
var ws=${tagsJson};
var si=0,wi=0,ch=[],tg=[],rs=false,st=0;
var sEl=document.getElementById('s'),wEl=document.getElementById('w');
var pool='abcdefghijklmnopqrstuvwxyz.!?@#$%&*';
function go(){tg=ws[wi].split('');ch=tg.map(function(c){return c===' '?' ':pool[Math.floor(Math.random()*pool.length)]});rs=true;st=0;wi=(wi+1)%ws.length}
go();
setInterval(function(){sEl.textContent=sc[si];si=(si+1)%sc.length},80);
setInterval(function(){if(rs){if(st<tg.length){for(var i=0;i<ch.length;i++){if(i<=st){ch[i]=tg[i]}else if(tg[i]!==' '){ch[i]=pool[Math.floor(Math.random()*pool.length)]}}st+=2}else{for(var i=0;i<tg.length;i++){ch[i]=tg[i]}rs=false;setTimeout(go,1500)}}wEl.textContent=ch.join('')},40);
</script></body></html>`;
};

const loadSplash = (win: BrowserWindow) => {
  const html = buildSplashHTML(resolveIsDark());
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

// --- Bootstrap ---

const bootstrap = async () => {
  fixEnv();

  if (devUrl) {
    createWindow(devUrl);
    return;
  }

  process.env.NODE_ENV = 'production';
  process.env.__PMUX_ELECTRON = '1';
  const appPath = app.getAppPath();
  process.env.__PMUX_APP_DIR = isDev ? process.cwd() : appPath;
  process.env.__PMUX_APP_DIR_UNPACKED = isDev ? process.cwd() : appPath.replace('app.asar', 'app.asar.unpacked');

  serverConfig = readServerConfig();
  currentLocale = readLocaleFromConfig();

  // macOS: nativeTheme을 앱 테마와 동기화해야 비활성 트래픽 라이트가 올바른 대비로 렌더링됨
  const appTheme = readAppConfig().appTheme || 'dark';
  nativeTheme.themeSource = appTheme as 'dark' | 'light' | 'system';

  if (serverConfig.mode === 'remote' && serverConfig.remoteUrl) {
    createWindow('about:blank');
    loadSplash(mainWindow!);
    mainWindow?.loadURL(serverConfig.remoteUrl);
  } else {
    serverConfig = { mode: 'local' };
    // 윈도우를 먼저 띄우고 로딩 화면을 보여준 뒤, 서버가 준비되면 전환
    createWindow('about:blank');
    loadSplash(mainWindow!);
    const port = await startLocalServer();
    mainWindow?.loadURL(`http://localhost:${port}`);
  }

  updateMenu();
};

ipcMain.handle('open-external', (_event, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('set-native-theme', (_event, theme: string) => {
  if (theme === 'dark' || theme === 'light' || theme === 'system') {
    nativeTheme.themeSource = theme;
  }
});

ipcMain.handle('set-locale', (_event, locale: string) => {
  if (typeof locale === 'string' && locale !== currentLocale) {
    currentLocale = locale;
    updateMenu();
  }
});

// --- Native Notifications ---

ipcMain.handle('show-notification', (_event, title: string, body: string) => {
  if (mainWindow?.isFocused()) return false;
  const notification = new Notification({ title, body });
  notification.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send('notification-click');
  });
  notification.show();
  return true;
});

ipcMain.handle('set-dock-badge', (_event, count: number) => {
  if (process.platform !== 'darwin') return;
  app.dock.setBadge(count > 0 ? String(count) : '');
});

// --- System Resources ---

ipcMain.handle('get-system-resources', () => {
  const metrics = app.getAppMetrics();
  let cpuTotal = 0;
  let memTotal = 0;
  for (const m of metrics) {
    cpuTotal += m.cpu.percentCPUUsage;
    memTotal += m.memory.workingSetSize * 1024; // KB → bytes
  }

  return {
    cpu: cpuTotal,
    memory: { used: memTotal },
  };
});

app.on('ready', bootstrap);

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else if (!devUrl) {
    bootstrap();
  }
});

app.on('window-all-closed', async () => {
  if (process.platform === 'darwin') return;

  // 안전장치: 전체 종료가 3초 이내에 완료되지 않으면 강제 종료
  const forceExit = setTimeout(() => app.exit(1), 3000);

  // 1) PTY onExit 콜백이 완료될 때까지 대기 → native ThreadSafeFunction drain
  if (serverShutdown) {
    await serverShutdown();
    serverShutdown = null;
  }

  // 2) 스토리지 flush (localStorage + 쿠키)
  await session.defaultSession?.flushStorageData()?.catch(() => {});
  await session.defaultSession?.cookies?.flushStore()?.catch(() => {});

  // 3) 모든 cleanup 완료 후 종료.
  //    app.exit()는 FreeEnvironment를 건너뛰어
  //    node-pty ThreadSafeFunction release 시 abort() 방지.
  clearTimeout(forceExit);
  app.exit(0);
});

// Cmd+Q 등으로 will-quit이 먼저 도달하는 경우,
// window-all-closed와 동일한 graceful shutdown 수행.
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', async (event) => {
  event.preventDefault();
  const forceExit = setTimeout(() => app.exit(1), 3000);

  if (serverShutdown) {
    await serverShutdown();
    serverShutdown = null;
  }

  await session.defaultSession?.flushStorageData()?.catch(() => {});
  await session.defaultSession?.cookies?.flushStore()?.catch(() => {});
  clearTimeout(forceExit);
  app.exit(0);
});

app.requestSingleInstanceLock();
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
