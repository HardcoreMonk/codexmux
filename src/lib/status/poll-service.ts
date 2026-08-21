export interface IStatusPollCounts {
  workspaceCount: number;
  paneCount: number;
  scannedTabCount: number;
  providerTabCount: number;
  terminalTabCount: number;
  broadcastUpdateCount: number;
  broadcastRemoveCount: number;
}

export interface IStatusPollSnapshot extends IStatusPollCounts {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

interface IStatusPollContext {
  startedAtMs: number;
  startedAtPerf: number;
}

interface IStatusPollServiceOptions {
  getTabCount: () => number;
  poll: () => Promise<void>;
  onPollError: (err: unknown) => void;
  getNow?: () => number;
  getPerfNow?: () => number;
  recordCounter?: (name: string, delta?: number) => void;
  recordDuration?: (name: string, durationMs: number) => void;
}

const POLL_INTERVAL_SMALL = 30_000;
const POLL_INTERVAL_MEDIUM = 45_000;
const POLL_INTERVAL_LARGE = 60_000;
const TAB_COUNT_MEDIUM = 11;
const TAB_COUNT_LARGE = 21;

export const getStatusPollingInterval = (tabCount: number): number => {
  if (tabCount >= TAB_COUNT_LARGE) return POLL_INTERVAL_LARGE;
  if (tabCount >= TAB_COUNT_MEDIUM) return POLL_INTERVAL_MEDIUM;
  return POLL_INTERVAL_SMALL;
};

export const createStatusPollSnapshot = ({
  startedAtMs,
  endedAtMs,
  durationMs,
  counts,
}: {
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  counts: IStatusPollCounts;
}): IStatusPollSnapshot => ({
  startedAt: new Date(startedAtMs).toISOString(),
  endedAt: new Date(endedAtMs).toISOString(),
  durationMs: Number(durationMs.toFixed(2)),
  ...counts,
});

export class StatusPollService {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private currentInterval = 0;
  private lastSnapshot: IStatusPollSnapshot | null = null;
  private readonly getNow: () => number;
  private readonly getPerfNow: () => number;

  constructor(private readonly options: IStatusPollServiceOptions) {
    this.getNow = options.getNow ?? Date.now;
    this.getPerfNow = options.getPerfNow ?? Date.now;
  }

  start(): void {
    this.stop();
    this.currentInterval = getStatusPollingInterval(this.options.getTabCount());
    this.pollingTimer = setInterval(() => {
      this.options.poll().catch((err) => {
        this.options.recordCounter?.('status.poll.errors');
        this.options.onPollError(err);
      });
    }, this.currentInterval);
  }

  stop(): void {
    if (!this.pollingTimer) return;
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
    this.currentInterval = 0;
  }

  refreshInterval(): void {
    if (!this.pollingTimer) return;
    const nextInterval = getStatusPollingInterval(this.options.getTabCount());
    if (nextInterval !== this.currentInterval) this.start();
  }

  beginPoll(): IStatusPollContext {
    return {
      startedAtMs: this.getNow(),
      startedAtPerf: this.getPerfNow(),
    };
  }

  finishPoll(context: IStatusPollContext, counts: IStatusPollCounts): void {
    const endedAtMs = this.getNow();
    const durationMs = this.getPerfNow() - context.startedAtPerf;
    this.lastSnapshot = createStatusPollSnapshot({
      startedAtMs: context.startedAtMs,
      endedAtMs,
      durationMs,
      counts,
    });
    this.options.recordDuration?.('status.poll', durationMs);
  }

  getCurrentInterval(): number {
    return this.currentInterval;
  }

  getLastSnapshot(): IStatusPollSnapshot | null {
    return this.lastSnapshot;
  }
}
