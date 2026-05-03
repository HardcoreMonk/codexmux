import { describe, expect, it } from 'vitest';
import {
  buildTerminalWebSocketPath,
  buildTerminalWebSocketUrl,
  getOrCreateTerminalClientId,
  resolveTerminalWebSocketEndpoint,
} from '@/lib/terminal-websocket-url';

describe('terminal websocket url helpers', () => {
  it('builds production and runtime v2 terminal websocket paths', () => {
    expect(buildTerminalWebSocketPath({
      endpoint: '/api/terminal',
      clientId: 'client-a',
      sessionName: 'pt-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    })).toBe('/api/terminal?clientId=client-a&session=pt-ws-a-pane-b-tab-c&cols=80&rows=24');

    expect(buildTerminalWebSocketPath({
      endpoint: '/api/v2/terminal',
      clientId: 'client-b',
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
    })).toBe('/api/v2/terminal?clientId=client-b&session=rtv2-ws-a-pane-b-tab-c');

    expect(buildTerminalWebSocketPath({
      endpoint: '/api/remote/terminal',
      clientId: 'client-c',
      sessionName: 'remote-ignored',
      sourceId: 'AMD_5800X',
      terminalId: 'main',
      cols: 120,
      rows: 36,
    })).toBe('/api/remote/terminal?clientId=client-c&sourceId=AMD_5800X&terminalId=main&cols=120&rows=36');
  });

  it('encodes query values and chooses ws or wss from page protocol', () => {
    expect(buildTerminalWebSocketUrl({
      endpoint: '/api/remote/terminal',
      clientId: 'client with space',
      sessionName: 'remote-ignored',
      sourceId: 'AMD_5800X',
      terminalId: 'main shell',
      cols: 120,
      rows: 40,
      location: { protocol: 'https:', host: 'codexmux.test' },
    })).toBe('wss://codexmux.test/api/remote/terminal?clientId=client+with+space&sourceId=AMD_5800X&terminalId=main+shell&cols=120&rows=40');

    expect(buildTerminalWebSocketUrl({
      endpoint: '/api/terminal',
      clientId: 'client-a',
      sessionName: 'pt-ws-a-pane-b-tab-c',
      location: { protocol: 'http:', host: '127.0.0.1:3000' },
    })).toBe('ws://127.0.0.1:3000/api/terminal?clientId=client-a&session=pt-ws-a-pane-b-tab-c');
  });

  it('stores one stable client id per session when storage is available', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    const first = getOrCreateTerminalClientId('rtv2-ws-a-pane-b-tab-c', {
      storage,
      createId: () => 'generated-a',
    });
    const second = getOrCreateTerminalClientId('rtv2-ws-a-pane-b-tab-c', {
      storage,
      createId: () => 'generated-b',
    });

    expect(first).toBe('generated-a');
    expect(second).toBe('generated-a');
    expect(values.get('pt-ws-cid-rtv2-ws-a-pane-b-tab-c')).toBe('generated-a');
  });

  it('resolves websocket endpoints from tab runtime identity', () => {
    expect(resolveTerminalWebSocketEndpoint({})).toBe('/api/terminal');
    expect(resolveTerminalWebSocketEndpoint({ runtimeVersion: 1 })).toBe('/api/terminal');
    expect(resolveTerminalWebSocketEndpoint({ runtimeVersion: 2 })).toBe('/api/v2/terminal');
    expect(resolveTerminalWebSocketEndpoint({ runtimeVersion: 3 as never })).toBe('/api/terminal');
  });
});
