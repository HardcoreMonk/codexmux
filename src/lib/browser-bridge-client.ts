export interface IBrowserConsoleEntry {
  level: string;
  text: string;
  ts: number;
  source?: string;
  line?: number;
  url?: string;
}

export interface IBrowserNetworkEntry {
  requestId: string;
  method: string;
  url: string;
  status?: number;
  mimeType?: string;
  resourceType?: string;
  error?: string;
  ts: number;
  endedAt?: number;
}

export interface IBrowserBridgeClient {
  list: () => Array<{ tabId: string; webContentsId: number }>;
  getUrl: (tabId: string) => string | null;
  getTitle: (tabId: string) => string | null;
  capture: (
    tabId: string,
    opts?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number; scale: number } },
  ) => Promise<string>;
  evaluate: (tabId: string, expression: string) => Promise<unknown>;
  getConsole: (tabId: string, since?: number) => IBrowserConsoleEntry[];
  getNetwork: (tabId: string, since?: number) => IBrowserNetworkEntry[];
  getResponseBody: (tabId: string, requestId: string) => Promise<string | null>;
  reload: (tabId: string) => void;
  navigate: (tabId: string, url: string) => Promise<void>;
}

type TGlobal = typeof globalThis & { __ptBrowserBridge?: IBrowserBridgeClient };

export const getBrowserBridge = (): IBrowserBridgeClient | null => {
  const g = globalThis as TGlobal;
  return g.__ptBrowserBridge ?? null;
};
