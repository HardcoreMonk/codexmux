import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusJsonlWatchService } from '@/lib/status/jsonl-watch-service';

interface IFakeWatcher {
  close: () => void;
  on: (event: 'error', handler: () => void) => void;
  closeMock: ReturnType<typeof vi.fn>;
  onMock: ReturnType<typeof vi.fn>;
  emitChange: () => void;
  emitError: () => void;
}

const createFakeWatcher = (): IFakeWatcher => {
  let changeHandler: (() => void) | null = null;
  let errorHandler: (() => void) | null = null;
  const closeMock = vi.fn();
  const onMock = vi.fn();
  return {
    close: () => closeMock(),
    on: (event: 'error', handler: () => void) => {
      onMock(event, handler);
      if (event === 'error') errorHandler = handler;
    },
    closeMock,
    onMock,
    emitChange: () => changeHandler?.(),
    emitError: () => errorHandler?.(),
    set changeHandler(handler: () => void) {
      changeHandler = handler;
    },
  } as IFakeWatcher & { changeHandler: () => void };
};

describe('status JSONL watch service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces file changes before invoking the change handler', async () => {
    vi.useFakeTimers();
    const watcher = createFakeWatcher();
    const onChange = vi.fn(async () => {});
    const watchFile = vi.fn((jsonlPath: string, handler: () => void) => {
      expect(jsonlPath).toBe('/tmp/session.jsonl');
      (watcher as IFakeWatcher & { changeHandler: () => void }).changeHandler = handler;
      return watcher;
    });
    const service = new StatusJsonlWatchService({ watchFile, onChange, debounceMs: 100 });

    expect(service.start('tab-a', '/tmp/session.jsonl')).toBe(true);
    watcher.emitChange();
    watcher.emitChange();
    await vi.advanceTimersByTimeAsync(99);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('tab-a', '/tmp/session.jsonl');
  });

  it('does not restart when the tab already watches the same path', () => {
    const watcher = createFakeWatcher();
    const watchFile = vi.fn((_: string, handler: () => void) => {
      (watcher as IFakeWatcher & { changeHandler: () => void }).changeHandler = handler;
      return watcher;
    });
    const service = new StatusJsonlWatchService({ watchFile, onChange: vi.fn() });

    expect(service.start('tab-a', '/tmp/session.jsonl')).toBe(true);
    expect(service.start('tab-a', '/tmp/session.jsonl')).toBe(false);

    expect(watchFile).toHaveBeenCalledTimes(1);
    expect(watcher.closeMock).not.toHaveBeenCalled();
  });

  it('replaces an existing watcher when the path changes', () => {
    const first = createFakeWatcher();
    const second = createFakeWatcher();
    const watchFile = vi.fn((_: string, handler: () => void) => {
      const watcher = watchFile.mock.calls.length === 1 ? first : second;
      (watcher as IFakeWatcher & { changeHandler: () => void }).changeHandler = handler;
      return watcher;
    });
    const service = new StatusJsonlWatchService({ watchFile, onChange: vi.fn() });

    service.start('tab-a', '/tmp/one.jsonl');
    service.start('tab-a', '/tmp/two.jsonl');

    expect(first.closeMock).toHaveBeenCalledTimes(1);
    expect(second.closeMock).not.toHaveBeenCalled();
    expect(service.has('tab-a')).toBe(true);
    expect(service.size()).toBe(1);
  });

  it('stops watchers and clears pending debounce timers', async () => {
    vi.useFakeTimers();
    const watcher = createFakeWatcher();
    const onChange = vi.fn(async () => {});
    const watchFile = vi.fn((_: string, handler: () => void) => {
      (watcher as IFakeWatcher & { changeHandler: () => void }).changeHandler = handler;
      return watcher;
    });
    const service = new StatusJsonlWatchService({ watchFile, onChange, debounceMs: 100 });

    service.start('tab-a', '/tmp/session.jsonl');
    watcher.emitChange();
    expect(service.stop('tab-a')).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).not.toHaveBeenCalled();
    expect(watcher.closeMock).toHaveBeenCalledTimes(1);
    expect(service.has('tab-a')).toBe(false);
  });

  it('removes watchers on fs error and stopAll closes every watcher', () => {
    const first = createFakeWatcher();
    const second = createFakeWatcher();
    const watchFile = vi.fn((_: string, handler: () => void) => {
      const watcher = watchFile.mock.calls.length === 1 ? first : second;
      (watcher as IFakeWatcher & { changeHandler: () => void }).changeHandler = handler;
      return watcher;
    });
    const service = new StatusJsonlWatchService({ watchFile, onChange: vi.fn() });

    service.start('tab-a', '/tmp/one.jsonl');
    first.emitError();
    expect(first.closeMock).toHaveBeenCalledTimes(1);
    expect(service.has('tab-a')).toBe(false);

    service.start('tab-b', '/tmp/two.jsonl');
    expect([...service.keys()]).toEqual(['tab-b']);
    service.stopAll();
    expect(second.closeMock).toHaveBeenCalledTimes(1);
    expect(service.size()).toBe(0);
  });
});
