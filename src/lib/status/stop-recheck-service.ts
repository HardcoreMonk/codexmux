interface ICodexStopRecheckInput {
  tabId: string;
  tmuxSession: string;
}

interface IStopSnippetRefreshInput {
  tabId: string;
  jsonlPath: string;
}

interface IStatusStopRecheckServiceOptions {
  delayMs: number;
  recheckCodexStop: (input: ICodexStopRecheckInput) => Promise<void>;
  refreshStopSnippet: (input: IStopSnippetRefreshInput) => Promise<void> | void;
  clearJsonlCache: (jsonlPath: string) => void;
  warn: (message: string) => void;
}

export class StatusStopRecheckService {
  constructor(private readonly options: IStatusStopRecheckServiceOptions) {}

  scheduleCodexStopRecheck(input: ICodexStopRecheckInput): void {
    setTimeout(() => {
      this.options.recheckCodexStop(input).catch((err) => {
        this.options.warn(`Codex stop JSONL verification failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, this.options.delayMs);
  }

  scheduleStopSnippetRefresh(input: IStopSnippetRefreshInput): void {
    Promise.resolve(this.options.refreshStopSnippet(input)).catch(() => {});
    setTimeout(() => {
      this.options.clearJsonlCache(input.jsonlPath);
      Promise.resolve(this.options.refreshStopSnippet(input)).catch(() => {});
    }, this.options.delayMs);
  }
}
