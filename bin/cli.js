#!/usr/bin/env node
// purplemux CLI — agent-facing HTTP API wrapper
// Reads PMUX_PORT, PMUX_TOKEN, PMUX_AGENT_ID from environment.

'use strict';

const PORT = process.env.PMUX_PORT;
const TOKEN = process.env.PMUX_TOKEN;
const AGENT_ID = process.env.PMUX_AGENT_ID;
const BASE = `http://localhost:${PORT}`;

const die = (msg) => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
};

const requireEnv = () => {
  if (!PORT) die('PMUX_PORT is not set');
  if (!TOKEN) die('PMUX_TOKEN is not set');
};

const requireAgentId = () => {
  if (!AGENT_ID) die('PMUX_AGENT_ID is not set');
};

const json = (res, body) => {
  if (!res.ok) {
    const msg = body?.error || `HTTP ${res.status}`;
    die(msg);
  }
  process.stdout.write(JSON.stringify(body, null, 2) + '\n');
};

const api = async (method, path, data) => {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: { 'X-Agent-Token': TOKEN, 'Content-Type': 'application/json' },
  };
  if (data !== undefined) opts.body = JSON.stringify(data);
  const resp = await fetch(url, opts);
  const body = resp.headers.get('content-type')?.includes('json')
    ? await resp.json()
    : null;
  if (!resp.ok) {
    const msg = body?.error || `HTTP ${resp.status}`;
    die(msg);
  }
  return { resp, body };
};

// --- Commands ---

const cmdWorkspaces = async () => {
  requireEnv();
  const { body } = await api('GET', '/api/agent-rpc/workspaces');
  json({ ok: true }, body);
};

const cmdTabList = async () => {
  requireEnv();
  requireAgentId();
  const { body } = await api('GET', `/api/agent-rpc/${AGENT_ID}/tab`);
  json({ ok: true }, body);
};

const cmdTabCreate = async (args) => {
  requireEnv();
  requireAgentId();
  const workspaceId = flagValue(args, '--workspace') || flagValue(args, '-w');
  const taskTitle = flagValue(args, '--title') || flagValue(args, '-t');
  if (!workspaceId) die('--workspace is required');
  const { body } = await api('POST', `/api/agent-rpc/${AGENT_ID}/tab`, {
    workspaceId,
    ...(taskTitle ? { taskTitle } : {}),
  });
  json({ ok: true }, body);
};

const cmdTabSend = async (args) => {
  requireEnv();
  requireAgentId();
  const tabId = args[0];
  const content = args.slice(1).join(' ');
  if (!tabId) die('tab ID is required');
  if (!content) die('content is required');
  const { body } = await api('POST', `/api/agent-rpc/${AGENT_ID}/tab/${tabId}/send`, { content });
  json({ ok: true }, body);
};

const cmdTabStatus = async (args) => {
  requireEnv();
  requireAgentId();
  const tabId = args[0];
  if (!tabId) die('tab ID is required');
  const { body } = await api('GET', `/api/agent-rpc/${AGENT_ID}/tab/${tabId}/status`);
  json({ ok: true }, body);
};

const cmdTabResult = async (args) => {
  requireEnv();
  requireAgentId();
  const tabId = args[0];
  if (!tabId) die('tab ID is required');
  const { body } = await api('GET', `/api/agent-rpc/${AGENT_ID}/tab/${tabId}/result`);
  json({ ok: true }, body);
};

const cmdTabClose = async (args) => {
  requireEnv();
  requireAgentId();
  const tabId = args[0];
  if (!tabId) die('tab ID is required');
  const { resp } = await api('DELETE', `/api/agent-rpc/${AGENT_ID}/tab/${tabId}`);
  if (resp.ok) process.stdout.write('ok\n');
};

const cmdMemorySave = async (args) => {
  requireEnv();
  requireAgentId();
  const tagsRaw = flagValue(args, '--tags');
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()) : [];
  const content = stripFlags(args, ['--tags']).join(' ');
  if (!content) die('content is required');
  const { body } = await api('POST', `/api/agent-rpc/${AGENT_ID}/memory`, { content, tags });
  json({ ok: true }, body);
};

const cmdMemorySearch = async (args) => {
  requireEnv();
  requireAgentId();
  const q = flagValue(args, '--q') || flagValue(args, '-q') || '';
  const tag = flagValue(args, '--tag') || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  const { body } = await api('GET', `/api/agent-rpc/${AGENT_ID}/memory${qs ? '?' + qs : ''}`);
  json({ ok: true }, body);
};

const cmdMemoryDelete = async (args) => {
  requireEnv();
  requireAgentId();
  const memoryId = args[0];
  if (!memoryId) die('memory ID is required');
  const { body } = await api('DELETE', `/api/agent-rpc/${AGENT_ID}/memory/${memoryId}`);
  json({ ok: true }, body);
};

const cmdApiGuide = async () => {
  requireEnv();
  const url = `${BASE}/api/agent-rpc/api-guide`;
  const resp = await fetch(url, {
    headers: { 'X-Agent-Token': TOKEN, Accept: 'text/plain' },
  });
  if (!resp.ok) die(`HTTP ${resp.status}`);
  const text = await resp.text();
  process.stdout.write(text + '\n');
};

// --- Flag parsing helpers ---

const flagValue = (args, name) => {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
};

const stripFlags = (args, names) => {
  const result = [];
  let i = 0;
  while (i < args.length) {
    if (names.includes(args[i])) {
      i += 2; // skip flag and value
    } else {
      result.push(args[i]);
      i++;
    }
  }
  return result;
};

// --- Usage ---

const usage = () => {
  process.stdout.write(`purplemux — agent CLI

Usage: purplemux <command> [args...]

Commands:
  workspaces                          List workspaces
  tab list                            List tabs
  tab create -w WORKSPACE [-t TITLE]  Create a tab
  tab send TAB_ID CONTENT...          Send instructions to a tab
  tab status TAB_ID                   Check tab status
  tab result TAB_ID                   Read tab result
  tab close TAB_ID                    Close a tab
  memory save [--tags a,b] CONTENT... Save a memory
  memory search [--q Q] [--tag TAG]   Search memories
  memory delete MEMORY_ID             Delete a memory
  api-guide                           Print full API reference

Environment:
  PMUX_PORT       Server port (required)
  PMUX_TOKEN      Agent token (required)
  PMUX_AGENT_ID   Agent ID (required for most commands)
`);
};

// --- Main ---

const main = async () => {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const sub = args[1];
  const rest = args.slice(2);

  switch (cmd) {
    case 'workspaces':
      return cmdWorkspaces();
    case 'tab':
      switch (sub) {
        case 'list': return cmdTabList();
        case 'create': return cmdTabCreate(rest);
        case 'send': return cmdTabSend(rest);
        case 'status': return cmdTabStatus(rest);
        case 'result': return cmdTabResult(rest);
        case 'close': return cmdTabClose(rest);
        default: die(`unknown tab command: ${sub || '(none)'}. Run 'purplemux help' for usage.`);
      }
      break;
    case 'memory':
    case 'mem':
      switch (sub) {
        case 'save': return cmdMemorySave(rest);
        case 'search': case 'list': return cmdMemorySearch(rest);
        case 'delete': case 'rm': return cmdMemoryDelete(rest);
        default: die(`unknown memory command: ${sub || '(none)'}. Run 'purplemux help' for usage.`);
      }
      break;
    case 'api-guide':
      return cmdApiGuide();
    case 'help':
    case '-h':
    case '--help':
      return usage();
    default:
      die(`unknown command: ${cmd}. Run 'purplemux help' for usage.`);
  }
};

main().catch((err) => {
  die(err.message || String(err));
});
