import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import * as pty from 'node-pty';
import os from 'os';
import { needsSetup } from '@/lib/config-store';
import { sanitizedEnv } from '@/lib/tmux';
import { shellPath } from '@/lib/preflight';
import { MSG_STDIN, MSG_RESIZE, encodeStdout, textDecoder } from '@/lib/terminal-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('install');

const INSTALL_COMMANDS: Record<string, string> = Object.freeze({
  clt: 'xcode-select --install 2>&1; sleep 1; open -b com.apple.dt.CommandLineTools.installondemand 2>/dev/null; echo ""; echo "Waiting for installation..."; while ! xcode-select -p &>/dev/null; do sleep 3; done; echo ""; echo "Command Line Tools installed."',
  brew: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  'tmux-install': 'brew install tmux',
  'tmux-upgrade': 'brew upgrade tmux',
  git: 'brew install git',
  claude: 'curl -fsSL https://claude.ai/install.sh | bash',
  'claude-path': 'SHELL_NAME=$(basename "$SHELL"); if [ "$SHELL_NAME" = "bash" ]; then RC="$HOME/.bashrc"; elif [ "$SHELL_NAME" = "zsh" ]; then RC="$HOME/.zshrc"; else RC="$HOME/.profile"; fi; if grep -q "\\.local/bin" "$RC" 2>/dev/null; then echo "~/.local/bin is already in PATH ($RC)"; else echo \'export PATH="$HOME/.local/bin:$PATH"\' >> "$RC" && echo "Added ~/.local/bin to PATH in $RC"; fi; export PATH="$HOME/.local/bin:$PATH"; echo ""; claude --version',
  'claude-login': 'claude',
});

let activeConn: { ws: WebSocket; pty: pty.IPty } | null = null;

const cleanup = () => {
  if (!activeConn) return;
  const conn = activeConn;
  activeConn = null;

  try {
    if ('destroy' in conn.pty) {
      (conn.pty as pty.IPty & { destroy: () => void }).destroy();
    } else {
      conn.pty.kill();
    }
  } catch {
    // already exited
  }
};

const disposeAll = (disposables: pty.IDisposable[]) => {
  for (const d of disposables) d.dispose();
  disposables.length = 0;
};

export const handleInstallConnection = async (ws: WebSocket, request: IncomingMessage) => {
  const isOnboarding = await needsSetup();
  if (!isOnboarding) {
    ws.close(1008, 'Setup already completed');
    return;
  }

  const url = new URL(request.url || '', 'http://localhost');
  const command = url.searchParams.get('command');

  if (!command || !(command in INSTALL_COMMANDS)) {
    ws.close(1008, 'Invalid command');
    return;
  }

  if (activeConn) {
    cleanup();
  }

  const shell = os.userInfo().shell || process.env.SHELL || '/bin/zsh';
  const cols = parseInt(url.searchParams.get('cols') || '', 10) || 80;
  const rows = parseInt(url.searchParams.get('rows') || '', 10) || 24;

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(shell, ['-il'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || '/',
      env: {
        ...sanitizedEnv(),
        PATH: shellPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });
  } catch (err) {
    log.error(`pty spawn failed: ${err instanceof Error ? err.message : err}`);
    ws.close(1011, 'PTY spawn failed');
    return;
  }

  activeConn = { ws, pty: ptyProcess };
  log.info(`install session started: ${command} (pid: ${ptyProcess.pid})`);

  const disposables: pty.IDisposable[] = [];

  disposables.push(
    ptyProcess.onData((data: string) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeStdout(data));
    }),
  );

  disposables.push(
    ptyProcess.onExit(() => {
      log.info(`install pty exited: ${command}`);
      disposeAll(disposables);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Process exited');
      }
      if (activeConn?.pty === ptyProcess) {
        activeConn = null;
      }
    }),
  );

  ws.on('message', (raw: Buffer | ArrayBuffer) => {
    const data = new Uint8Array(
      raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    if (data.length === 0) return;

    const type = data[0];
    const payload = data.slice(1);

    switch (type) {
      case MSG_STDIN:
        ptyProcess.write(textDecoder.decode(payload));
        break;
      case MSG_RESIZE:
        if (payload.length >= 4) {
          const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
          const newCols = view.getUint16(0);
          const newRows = view.getUint16(2);
          if (newCols > 0 && newRows > 0) {
            ptyProcess.resize(newCols, newRows);
          }
        }
        break;
    }
  });

  ws.on('close', () => {
    disposeAll(disposables);
    if (activeConn?.ws === ws) cleanup();
  });

  ws.on('error', () => {
    disposeAll(disposables);
    if (activeConn?.ws === ws) cleanup();
  });

  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ptyProcess.write(INSTALL_COMMANDS[command] + '\n');
    }
  }, 300);
};

export const gracefulInstallShutdown = () => {
  if (activeConn && activeConn.ws.readyState === WebSocket.OPEN) {
    activeConn.ws.close(1001, 'Server shutting down');
  }
  cleanup();
};
