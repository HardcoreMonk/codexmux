#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';

const baseUrl = process.env.CODEXMUX_RUNTIME_V2_SMOKE_URL || 'http://127.0.0.1:8132';
const token = process.env.CODEXMUX_TOKEN
  || process.env.CMUX_TOKEN
  || await fs.readFile(path.join(os.homedir(), '.codexmux', 'cli-token'), 'utf-8').then((s) => s.trim());
const headers = { 'x-cmux-token': token };
const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const encoder = new TextEncoder();

const encodeStdin = (data) => {
  const payload = encoder.encode(data);
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = MSG_STDIN;
  frame.set(payload, 1);
  return frame;
};

const encodeResize = (cols, rows) => {
  const frame = new ArrayBuffer(5);
  const view = new DataView(frame);
  view.setUint8(0, MSG_RESIZE);
  view.setUint16(1, cols);
  view.setUint16(3, rows);
  return frame;
};

const request = async (pathname, init = {}) => {
  const res = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathname} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

const wsUrl = (sessionName) => {
  const url = new URL(`/api/v2/terminal?session=${encodeURIComponent(sessionName)}&cols=80&rows=24`, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
};

const toBuffer = (data) => {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
};

const waitForTerminalSmoke = (sessionName, expectedCwd) =>
  new Promise((resolve, reject) => {
    let output = '';
    const ws = new WebSocket(wsUrl(sessionName), { headers });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timed out waiting for terminal output; got ${JSON.stringify(output.slice(-200))}`));
    }, 10_000);

    ws.on('open', () => {
      ws.send(encodeResize(100, 30));
      ws.send(encodeStdin('pwd\nstty size\n'));
    });
    ws.on('message', (data) => {
      const bytes = toBuffer(data);
      if (bytes[0] === MSG_STDOUT) {
        output += bytes.subarray(1).toString('utf-8');
      } else {
        output += bytes.toString('utf-8');
      }
      if (output.includes(expectedCwd) && /(?:^|\r?\n)30 100(?:\r?\n|$)/.test(output)) {
        clearTimeout(timer);
        ws.close();
        resolve(output);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const main = async () => {
  let workspace;
  let failed = false;
  try {
    await request('/api/v2/runtime/health');
    workspace = await request('/api/v2/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Runtime V2 Smoke', defaultCwd: process.cwd() }),
    });
    const listed = await request('/api/v2/workspaces');
    if (!listed.workspaces?.some((w) => w.id === workspace.id)) {
      throw new Error(`created workspace not returned by list: ${workspace.id}`);
    }
    const tab = await request('/api/v2/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: workspace.id, paneId: workspace.rootPaneId, cwd: process.cwd() }),
    });
    await waitForTerminalSmoke(tab.sessionName, process.cwd());
    console.log(JSON.stringify({ ok: true, workspaceId: workspace.id, tabId: tab.id, sessionName: tab.sessionName }, null, 2));
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    if (workspace?.id) {
      try {
        await request(`/api/v2/workspaces/${encodeURIComponent(workspace.id)}`, { method: 'DELETE' });
      } catch (err) {
        if (!failed) throw err;
        console.error(`cleanup failed for workspace ${workspace.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
