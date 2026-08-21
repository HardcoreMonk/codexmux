import { watch, type FSWatcher } from 'fs';

interface IStatusJsonlWatcher {
  close: () => void;
  on: (event: 'error', listener: () => void) => unknown;
}

interface IJsonlWatchEntry {
  watcher: IStatusJsonlWatcher;
  jsonlPath: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

interface IStatusJsonlWatchServiceOptions {
  watchFile?: (jsonlPath: string, listener: () => void) => IStatusJsonlWatcher;
  onChange: (tabId: string, jsonlPath: string) => Promise<void> | void;
  debounceMs?: number;
  onStart?: (tabId: string, jsonlPath: string) => void;
  onStop?: (tabId: string) => void;
}

const DEFAULT_JSONL_WATCH_DEBOUNCE_MS = 100;

export class StatusJsonlWatchService {
  private watchers = new Map<string, IJsonlWatchEntry>();
  private readonly watchFile: (jsonlPath: string, listener: () => void) => IStatusJsonlWatcher;
  private readonly debounceMs: number;

  constructor(private readonly options: IStatusJsonlWatchServiceOptions) {
    this.watchFile = options.watchFile ?? ((jsonlPath, listener) => watch(jsonlPath, listener) as FSWatcher);
    this.debounceMs = options.debounceMs ?? DEFAULT_JSONL_WATCH_DEBOUNCE_MS;
  }

  start(tabId: string, jsonlPath: string): boolean {
    const existing = this.watchers.get(tabId);
    if (existing?.jsonlPath === jsonlPath) return false;
    if (existing) this.stop(tabId);

    this.options.onStart?.(tabId, jsonlPath);
    try {
      const watcher = this.watchFile(jsonlPath, () => {
        const current = this.watchers.get(tabId);
        if (!current) return;
        if (current.debounceTimer) clearTimeout(current.debounceTimer);
        current.debounceTimer = setTimeout(() => {
          Promise.resolve(this.options.onChange(tabId, jsonlPath)).catch(() => {});
        }, this.debounceMs);
      });
      watcher.on('error', () => {
        this.stop(tabId);
      });
      this.watchers.set(tabId, { watcher, jsonlPath, debounceTimer: null });
      return true;
    } catch {
      return false;
    }
  }

  stop(tabId: string): boolean {
    const entry = this.watchers.get(tabId);
    if (!entry) return false;
    this.options.onStop?.(tabId);
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    try {
      entry.watcher.close();
    } catch {
      // noop
    }
    this.watchers.delete(tabId);
    return true;
  }

  stopAll(): void {
    for (const tabId of [...this.watchers.keys()]) {
      this.stop(tabId);
    }
  }

  has(tabId: string): boolean {
    return this.watchers.has(tabId);
  }

  size(): number {
    return this.watchers.size;
  }

  keys(): IterableIterator<string> {
    return this.watchers.keys();
  }
}
