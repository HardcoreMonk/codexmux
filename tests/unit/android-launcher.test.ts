import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

interface IElement {
  appendChild: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  classList: {
    toggle: ReturnType<typeof vi.fn>;
  };
  disabled: boolean;
  focus: ReturnType<typeof vi.fn>;
  hidden: boolean;
  querySelector: ReturnType<typeof vi.fn>;
  replaceChildren: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  textContent: string;
  value: string;
}

interface ILauncherResult {
  fetchCalls: string[];
  href: string;
  status: string;
}

const createElement = (): IElement => {
  const element = {
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    classList: {
      toggle: vi.fn(),
    },
    disabled: false,
    focus: vi.fn(),
    hidden: false,
    querySelector: vi.fn(),
    replaceChildren: vi.fn(),
    select: vi.fn(),
    textContent: '',
    value: '',
  };
  element.querySelector.mockImplementation(() => ({
    ...createElement(),
    querySelector: vi.fn(),
  }));
  return element;
};

const runLauncherOpenServer = async (serverUrl: string): Promise<ILauncherResult> => {
  const html = readFileSync('android-web/index.html', 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  if (!script) throw new Error('Android launcher script not found');

  const elements = new Map<string, IElement>();
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  const storage = new Map<string, string>();
  const fetchCalls: string[] = [];
  const window = {
    clearTimeout: vi.fn(),
    CodexmuxAndroid: null,
    location: {
      href: 'https://localhost/',
      protocol: 'https:',
      search: '',
    },
    setTimeout: vi.fn(() => 1),
  };
  const context = vm.createContext({
    AbortController,
    console,
    document: {
      createElement,
      getElementById: getElement,
    },
    fetch: vi.fn(async (url: string) => {
      fetchCalls.push(url);
      throw new TypeError('Failed to fetch');
    }),
    fetchCalls,
    JSON,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    URL,
    URLSearchParams,
    window,
  });

  vm.runInContext(`
    ${script}
    globalThis.__launcherResult = openServer(${JSON.stringify(serverUrl)}).then(() => ({
      fetchCalls,
      href: window.location.href,
      status: status.textContent,
    }));
  `, context);

  return await (context.__launcherResult as Promise<ILauncherResult>);
};

describe('Android launcher', () => {
  it('navigates directly to http servers from the https launcher to avoid mixed-content probe failures', async () => {
    const result = await runLauncherOpenServer('http://100.112.40.104:8132');

    expect(result.fetchCalls).toEqual([]);
    expect(result.href).toBe('http://100.112.40.104:8132');
    expect(result.status).toBe('연결 중...');
  });
});
