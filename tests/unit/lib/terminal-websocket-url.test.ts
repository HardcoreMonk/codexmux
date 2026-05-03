import { describe, expect, it } from 'vitest';
import {
  buildTerminalWebSocketPath,
  buildTerminalWebSocketUrl,
  getOrCreateTerminalClientId,
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
  });

  it('encodes query values and chooses ws or wss from page protocol', () => {
    expect(buildTerminalWebSocketUrl({
      endpoint: '/api/v2/terminal',
      clientId: 'client with space',
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 120,
      rows: 40,
      location: { protocol: 'https:', host: 'codexmux.test' },
    })).toBe('wss://codexmux.test/api/v2/terminal?clientId=client+with+space&session=rtv2-ws-a-pane-b-tab-c&cols=120&rows=40');

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
});
