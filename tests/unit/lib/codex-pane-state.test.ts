import { describe, expect, it } from 'vitest';

import { hasCodexInterruptedPrompt } from '@/lib/codex-pane-state';

describe('hasCodexInterruptedPrompt', () => {
  it('wrap된 Codex conversation interrupted 입력 프롬프트를 인식한다', () => {
    const pane = [
      '• 편집을 시작합니다.',
      '',
      '■ Conversation interrupted - tell the model',
      'what to do differently. Something went wrong?',
      'Hit `/feedback` to report the issue.',
      '',
      '',
      '› Implement {feature}',
      '',
      '  gpt-5.5 xhigh · /data/projects/codex-zone/…',
      '',
    ].join('\n');

    expect(hasCodexInterruptedPrompt(pane)).toBe(true);
  });

  it('이전 interrupt 문구 뒤에 새 작업 출력이 있으면 현재 프롬프트로 보지 않는다', () => {
    const pane = [
      '■ Conversation interrupted - tell the model what to do differently.',
      '',
      '› Implement {feature}',
      '',
      '• 파일을 읽고 있습니다.',
      '↳ Read src/lib/status-manager.ts',
    ].join('\n');

    expect(hasCodexInterruptedPrompt(pane)).toBe(false);
  });

  it('프롬프트 라인이 없으면 일반 출력으로 취급한다', () => {
    const pane = [
      'The log mentioned Conversation interrupted - tell the model what to do differently.',
      'No active input prompt is visible here.',
    ].join('\n');

    expect(hasCodexInterruptedPrompt(pane)).toBe(false);
  });
});
