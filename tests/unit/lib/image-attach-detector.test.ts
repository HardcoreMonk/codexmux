import { describe, expect, it, vi } from 'vitest';

import { countImageRefs, waitForImageAttachments } from '@/lib/image-attach-detector';

describe('countImageRefs', () => {
  it('빈 문자열은 0', () => {
    expect(countImageRefs('')).toBe(0);
  });

  it('일반 텍스트만 있으면 0', () => {
    expect(countImageRefs('Hello world\nNo images here')).toBe(0);
  });

  it('단일 [Image #1] 참조를 인식한다', () => {
    const pane = [
      '────────────────',
      '❯ [Image #1]',
      '────────────────',
    ].join('\n');
    expect(countImageRefs(pane)).toBe(1);
  });

  it('여러 [Image #N] 참조를 모두 센다', () => {
    const pane = '❯ [Image #1] [Image #2] [Image #3] 이미지 보여?';
    expect(countImageRefs(pane)).toBe(3);
  });

  it('두 자리 이상의 인덱스도 인식한다', () => {
    expect(countImageRefs('[Image #10] [Image #99] [Image #123]')).toBe(3);
  });

  it('비슷한 패턴(공백/형식 다름)은 매칭하지 않는다', () => {
    const pane = [
      '[image #1]',
      '[Image#1]',
      '[Image # 1]',
      '[Image #1] valid',
    ].join('\n');
    expect(countImageRefs(pane)).toBe(1);
  });

  it('이전 메시지 + 입력창에 모두 있으면 합산해서 센다', () => {
    const pane = [
      'User: [Image #1] 이전 질문',
      '──────',
      '❯ [Image #2] [Image #3]',
      '──────',
    ].join('\n');
    expect(countImageRefs(pane)).toBe(3);
  });
});

describe('waitForImageAttachments', () => {
  const noDelay = () => Promise.resolve();

  it('expectedNewRefs가 0이면 즉시 confirmed', async () => {
    const capture = vi.fn();
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 0,
      baselineRefs: 0,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(0);
    expect(capture).not.toHaveBeenCalled();
  });

  it('첫 capture에서 ref 수가 충분하면 즉시 confirmed', async () => {
    const capture = vi.fn().mockResolvedValue('❯ [Image #1] [Image #2]');
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 2,
      baselineRefs: 0,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalCount).toBe(2);
  });

  it('baseline을 고려해서 새로 나타난 만큼만 카운트', async () => {
    const capture = vi.fn().mockResolvedValue('User: [Image #1]\n❯ [Image #2]');
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 1,
      baselineRefs: 1,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('초기에 부족하다가 폴링 중에 충분해지면 confirmed', async () => {
    const capture = vi.fn()
      .mockResolvedValueOnce('❯ ')
      .mockResolvedValueOnce('❯ ')
      .mockResolvedValueOnce('❯ [Image #1]');
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 1,
      baselineRefs: 0,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.finalCount).toBe(1);
  });

  it('타임아웃 시 confirmed=false 반환', async () => {
    const capture = vi.fn().mockResolvedValue('❯ ');
    const times = (() => {
      let t = 0;
      return () => {
        t += 50;
        return t;
      };
    })();
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 1,
      baselineRefs: 0,
      timeoutMs: 200,
      pollIntervalMs: 100,
      now: times,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(false);
    expect(result.finalCount).toBe(0);
    expect(capture).toHaveBeenCalled();
  });

  it('capture가 throw하면 무시하고 다음 폴링 진행', async () => {
    const capture = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('❯ [Image #1]');
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 1,
      baselineRefs: 0,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('여러 장 첨부도 카운트가 모두 도달해야 confirmed', async () => {
    const capture = vi.fn()
      .mockResolvedValueOnce('❯ [Image #1]')
      .mockResolvedValueOnce('❯ [Image #1] [Image #2]')
      .mockResolvedValueOnce('❯ [Image #1] [Image #2] [Image #3]');
    const result = await waitForImageAttachments({
      capture,
      expectedNewRefs: 3,
      baselineRefs: 0,
      delay: noDelay,
    });
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.finalCount).toBe(3);
  });
});
