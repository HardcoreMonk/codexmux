const IMAGE_REF_PATTERN = /\[Image #\d+\]/g;

const countImageRefs = (paneText: string): number => {
  const matches = paneText.match(IMAGE_REF_PATTERN);
  return matches ? matches.length : 0;
};

interface IWaitOptions {
  capture: () => Promise<string>;
  expectedNewRefs: number;
  baselineRefs: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

interface IWaitResult {
  confirmed: boolean;
  attempts: number;
  finalCount: number;
  elapsedMs: number;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForImageAttachments = async ({
  capture,
  expectedNewRefs,
  baselineRefs,
  timeoutMs = 5000,
  pollIntervalMs = 100,
  now = Date.now,
  delay = defaultDelay,
}: IWaitOptions): Promise<IWaitResult> => {
  const start = now();
  if (expectedNewRefs <= 0) {
    return { confirmed: true, attempts: 0, finalCount: baselineRefs, elapsedMs: 0 };
  }

  const target = baselineRefs + expectedNewRefs;
  const deadline = start + timeoutMs;
  let attempts = 0;
  let lastCount = baselineRefs;

  while (now() < deadline) {
    attempts += 1;
    try {
      const text = await capture();
      lastCount = countImageRefs(text);
      if (lastCount >= target) {
        return { confirmed: true, attempts, finalCount: lastCount, elapsedMs: now() - start };
      }
    } catch {
      /* retry */
    }
    if (now() + pollIntervalMs >= deadline) break;
    await delay(pollIntervalMs);
  }

  return { confirmed: false, attempts, finalCount: lastCount, elapsedMs: now() - start };
};

export { countImageRefs, waitForImageAttachments, IMAGE_REF_PATTERN };
export type { IWaitOptions, IWaitResult };
