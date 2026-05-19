import { describe, expect, it } from 'vitest';
import {
  WEB_INPUT_FOLLOW_UP_ENTER_DELAY_MS,
  buildWebInputFrames,
} from '@/hooks/use-web-input';

describe('use-web-input payloads', () => {
  it('submits a single-line Codex prompt as bracketed paste with Enter in the same frame', () => {
    expect(buildWebInputFrames('에페메라 0.3.3 정리')).toEqual([
      { data: '\x1b[200~에페메라 0.3.3 정리\x1b[201~\r' },
      { data: '\r', delayMs: WEB_INPUT_FOLLOW_UP_ENTER_DELAY_MS },
    ]);
  });

  it('preserves multiline prompts inside the bracketed paste frame', () => {
    expect(buildWebInputFrames('첫 줄\n둘째 줄')).toEqual([
      { data: '\x1b[200~첫 줄\n둘째 줄\x1b[201~\r' },
      { data: '\r', delayMs: WEB_INPUT_FOLLOW_UP_ENTER_DELAY_MS },
    ]);
  });
});
