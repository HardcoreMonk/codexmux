import { describe, expect, it } from 'vitest';

import { hasPermissionPrompt, parsePermissionOptions } from '@/lib/permission-prompt';

describe('parsePermissionOptions', () => {
  it('numbered Yes/No 프롬프트에서 포커스된 옵션을 인식한다', () => {
    const pane = [
      'Do you want to proceed?',
      '',
      '❯ 1. Yes',
      '  2. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual(['1. Yes', '2. No']);
    expect(result.focusedIndex).toBe(0);
  });

  it('좁은 터미널에서 "2Yes"처럼 wrap된 라인도 파싱한다', () => {
    const pane = [
      'Permission required',
      '',
      '  1. Yes',
      '❯ 2Yes, and don\'t ask again',
      '  3. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toHaveLength(3);
    expect(result.focusedIndex).toBe(1);
    expect(result.options[1]).toContain("Yes, and don't ask again");
  });

  it('알려지지 않은 패턴은 빈 옵션을 반환한다', () => {
    const pane = [
      'Some random output',
      '❯ Foo',
      '  Bar',
    ].join('\n');

    expect(parsePermissionOptions(pane)).toEqual({ options: [], focusedIndex: 0 });
  });

  it('손상된 pane capture에서 옵션 텍스트를 복원한다', () => {
    const pane = [
      'Do you want to proceed?',
      ' ❯ 1. Yescurrent status for this tab',
      "  2.Yes, and don't ask: curl -s http://localhost:8022/api/status",
      '',
      '   3. No',
      ' Esc to cancel · Tab to amend · ctrl+e to explain',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual([
      '1. Yes',
      "2. Yes, and don't ask again for: curl -s http://localhost:8022/api/status",
      '3. No',
    ]);
    expect(result.focusedIndex).toBe(0);
  });

  it('terminal soft-wrap으로 다음 줄로 이어진 긴 옵션을 합친다', () => {
    const pane = [
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      "   2. Yes, and don\u2019t ask again for: python3 -c \"import sys,json; d=json.loads(sys.stdin.read()); print('type:',d.get('type'),'| timestamp:',d.get('timestamp'),'|",
      "                                  stop_reason:',d.get('message',{}).get('stop_reason'))\"",
      '   3. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual([
      '1. Yes',
      "2. Yes, and don\u2019t ask again for: python3 -c \"import sys,json; d=json.loads(sys.stdin.read()); print('type:',d.get('type'),'| timestamp:',d.get('timestamp'),'|stop_reason:',d.get('message',{}).get('stop_reason'))\"",
      '3. No',
    ]);
    expect(result.focusedIndex).toBe(0);
  });

  it('keyword 기반 Accept/Decline 프롬프트를 인식한다', () => {
    const pane = [
      'Trust this workspace?',
      '',
      '❯ Accept',
      '  Decline',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual(['Accept', 'Decline']);
    expect(result.focusedIndex).toBe(0);
  });
});

describe('hasPermissionPrompt', () => {
  it('유효한 프롬프트에서 true를 반환한다', () => {
    const pane = '\n❯ 1. Yes\n  2. No\n';
    expect(hasPermissionPrompt(pane)).toBe(true);
  });

  it('프롬프트가 없으면 false를 반환한다', () => {
    expect(hasPermissionPrompt('just some logs\nmore logs')).toBe(false);
  });
});
