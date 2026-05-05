# Approval Queue Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sanitized approval prompt metadata so the global approval queue can distinguish command, file, permission, resume-directory, and conversation prompts.

**Implementation Status:** Completed in `c9b3d8f`. Remaining follow-up is tracked in `docs/FOLLOW-UP.md`.

**Architecture:** Extend the existing pane-capture parser first, preserving the current `options` and `focusedIndex` behavior. Add metadata to `/api/tmux/permission-options`, map it through pure approval queue helpers for UI labels, show dense badges in `ApprovalQueueItem`, and keep Web Push navigation unchanged with raw prompt detail excluded from the push payload.

**Tech Stack:** TypeScript, Next.js Pages Router API routes, React 19, next-intl messages, lucide-react icons, Vitest node tests, existing `smoke:permission`.

---

## File Structure

- Modify `src/lib/permission-prompt.ts`
  - Own metadata types, conservative classification, command/file hint redaction, and default metadata.
- Modify `tests/unit/lib/permission-prompt.test.ts`
  - Cover command/file/permission/resume/conversation/unknown classification and redaction.
- Modify `src/pages/api/tmux/permission-options.ts`
  - Return `{ options, focusedIndex, metadata }` while preserving existing HTTP behavior.
- Create `tests/unit/pages/permission-options-api.test.ts`
  - Mock tmux/capture helpers and verify the API response shape.
- Modify `src/lib/approval-queue.ts`
  - Add label/risk/fallback mapping helpers and safe defaults.
- Modify `tests/unit/lib/approval-queue.test.ts`
  - Cover mapping helpers and fallback behavior.
- Modify `src/components/features/workspace/approval-queue-item.tsx`
  - Fetch metadata, show prompt type/risk badges, optional sanitized detail line, and reasoned fallback.
- Modify `messages/ko/notification.json`
- Modify `messages/en/notification.json`
  - Add prompt type, risk, and fallback copy.
- Modify `src/lib/status-manager.ts`
  - Add needs-input Web Push enum placeholders without prompt detail.
- Modify `docs/STATUS.md`
- Modify `docs/TESTING.md`
- Modify `docs/FOLLOW-UP.md`
  - Document metadata-first queue behavior and verification.

Do not commit from this plan unless the user explicitly requests commit/push.

---

### Task 1: Parser Metadata

**Files:**
- Modify: `src/lib/permission-prompt.ts`
- Modify: `tests/unit/lib/permission-prompt.test.ts`

- [ ] **Step 1: Extend the parser tests first**

Add these cases to `tests/unit/lib/permission-prompt.test.ts`.

```typescript
it('명령 approval prompt metadata를 생성하고 command preview를 sanitize한다', () => {
  const pane = [
    'Would you like to run the following command?',
    '  1. Yes, proceed',
    "  2. Yes, and don't ask again for commands that start with `curl -H \"x-cmux-token: secret\" /data/projects/app`",
    '  3. No, and tell Codex what to do differently',
  ].join('\n');

  const result = parsePermissionOptions(pane);

  expect(result.options).toHaveLength(3);
  expect(result.metadata).toMatchObject({
    promptType: 'command',
    approvalKind: 'allow',
    riskLevel: 'high',
    fallbackReason: null,
  });
  expect(result.metadata.commandPreview).toContain('curl');
  expect(JSON.stringify(result.metadata)).not.toContain('secret');
  expect(JSON.stringify(result.metadata)).not.toContain('/data/projects');
});

it('파일 approval prompt metadata는 basename hint만 유지한다', () => {
  const pane = [
    'Codex wants to edit /data/projects/codexmux/src/lib/secret-file.ts',
    '',
    '❯ 1. Yes',
    '  2. No',
  ].join('\n');

  const result = parsePermissionOptions(pane);

  expect(result.metadata.promptType).toBe('file');
  expect(result.metadata.riskLevel).toBe('medium');
  expect(result.metadata.fileHints).toEqual(['secret-file.ts']);
  expect(JSON.stringify(result.metadata)).not.toContain('/data/projects');
});

it('resume directory prompt metadata를 directory approval로 분류한다', () => {
  const pane = [
    'Choose working directory to resume this session',
    '',
    '› 1. Use session directory (/data/projects/codex-zone/purecvisor-single)',
    '  2. Use current directory (/home/hardcoremonk)',
  ].join('\n');

  const result = parsePermissionOptions(pane);

  expect(result.metadata).toMatchObject({
    promptType: 'resume-directory',
    approvalKind: 'directory',
    riskLevel: 'low',
  });
  expect(result.metadata.fileHints).toEqual([]);
  expect(JSON.stringify(result.metadata)).not.toContain('/data/projects');
  expect(JSON.stringify(result.metadata)).not.toContain('/home/hardcoremonk');
});

it('conversation prompt metadata를 input으로 분류한다', () => {
  const pane = [
    'How should Codex continue?',
    '',
    '❯ Continue this conversation',
    '  Send message as new prompt',
  ].join('\n');

  const result = parsePermissionOptions(pane);

  expect(result.metadata).toMatchObject({
    promptType: 'conversation',
    approvalKind: 'input',
    riskLevel: 'low',
  });
});

it('알 수 없는 option prompt는 unknown metadata로 유지한다', () => {
  const pane = [
    'A prompt with known options but no clear type',
    '',
    '❯ 1. Yes',
    '  2. No',
  ].join('\n');

  const result = parsePermissionOptions(pane);

  expect(result.options).toEqual(['1. Yes', '2. No']);
  expect(result.metadata).toMatchObject({
    promptType: 'unknown',
    approvalKind: 'unknown',
    riskLevel: 'unknown',
    commandPreview: null,
    fileHints: [],
    fallbackReason: null,
  });
});
```

- [ ] **Step 2: Run the parser tests and verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts
```

Expected: FAIL because `metadata` is not present on `parsePermissionOptions()` results.

- [ ] **Step 3: Add metadata types and defaults**

In `src/lib/permission-prompt.ts`, add these exported types near the top of the file.

```typescript
export type TApprovalPromptType =
  | 'command'
  | 'file'
  | 'permission'
  | 'resume-directory'
  | 'conversation'
  | 'unknown';

export type TApprovalKind =
  | 'allow'
  | 'deny'
  | 'trust'
  | 'directory'
  | 'input'
  | 'unknown';

export type TApprovalRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface IApprovalPromptMetadata {
  promptType: TApprovalPromptType;
  approvalKind: TApprovalKind;
  riskLevel: TApprovalRiskLevel;
  commandPreview: string | null;
  fileHints: string[];
  fallbackReason: null;
}

export interface IPermissionPromptParseResult {
  options: string[];
  focusedIndex: number;
  metadata: IApprovalPromptMetadata;
}
```

Add this default helper below the current regex constants.

```typescript
export const createEmptyApprovalPromptMetadata = (): IApprovalPromptMetadata => ({
  promptType: 'unknown',
  approvalKind: 'unknown',
  riskLevel: 'unknown',
  commandPreview: null,
  fileHints: [],
  fallbackReason: null,
});
```

- [ ] **Step 4: Add redaction and classifier helpers**

Add these helpers in `src/lib/permission-prompt.ts` below `normalizeOption`.

```typescript
const PATH_RE = /(?:~\/\.codexmux\/cli-token|[A-Za-z]:\\[^\s'"]+|(?:\/[^\s'"]+)+)/g;
const TOKEN_RE = /(?:"token"\s*:\s*"[^"]*"|Authorization:\s*Bearer\s+\S+|x-cmux-token(?::\s*|=\s*|\s+)\S+|\btoken\s*[:=]\s*\S+)/gi;
const JSONL_RE = /\S+\.jsonl\b/g;
const FILE_BASENAME_RE = /(?:[A-Za-z]:\\|\/)[^\s'"]+/g;
const COMMAND_HINT_RE = /(?:for commands? that start with|for):\s*`?([^`\n]+)`?/i;
const BACKTICK_COMMAND_RE = /`([^`\n]+)`/;
const DESTRUCTIVE_COMMAND_RE = /\b(rm\s+-rf|git\s+reset\s+--hard|sudo\s+rm|mkfs|dd\s+if=|drop\s+table|truncate\s+table)\b/i;

const redactApprovalText = (value: string): string =>
  value
    .replace(TOKEN_RE, '[secret]')
    .replace(JSONL_RE, '[path]')
    .replace(PATH_RE, '[path]')
    .replace(/\bcwd\b\s*[:=]\s*\S+/gi, 'cwd=[path]')
    .replace(/\bsessionName\b\s*[:=]\s*\S+/g, 'sessionName=[runtime-session]')
    .replace(/\b(prompt|assistantText|terminalOutput)\b\s*[:=]\s*\S+/gi, '$1=[redacted]');

const truncatePreview = (value: string): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
};

const extractCommandPreview = (text: string): string | null => {
  const command = text.match(COMMAND_HINT_RE)?.[1] ?? text.match(BACKTICK_COMMAND_RE)?.[1] ?? null;
  if (!command) return null;
  return truncatePreview(redactApprovalText(command));
};

const extractFileHints = (text: string): string[] => {
  const names = new Set<string>();
  for (const match of text.matchAll(FILE_BASENAME_RE)) {
    const raw = match[0].replace(/['").,;:]+$/g, '');
    const normalized = raw.replace(/\\/g, '/');
    const basename = normalized.split('/').filter(Boolean).pop();
    if (basename && basename !== '[path]' && !basename.endsWith('.jsonl')) {
      names.add(basename);
    }
    if (names.size >= 3) break;
  }
  return [...names];
};

const classifyPromptType = (text: string, options: string[]): TApprovalPromptType => {
  const lower = `${text}\n${options.join('\n')}`.toLowerCase();
  if (hasOption(options, 'Use session directory') && hasOption(options, 'Use current directory')) return 'resume-directory';
  if (hasOption(options, 'Continue this conversation') || hasOption(options, 'Send message as') || hasOption(options, 'Resume from summary')) return 'conversation';
  if (lower.includes('bypass permissions') || lower.includes('trust this workspace') || lower.includes('open system settings') || lower.includes('sandbox')) return 'permission';
  if (lower.includes('run the following command') || lower.includes('command') || extractCommandPreview(options.join('\n')) !== null) return 'command';
  if (lower.includes('edit ') || lower.includes('write ') || lower.includes('read ') || lower.includes('file') || extractFileHints(text).length > 0) return 'file';
  return 'unknown';
};

const classifyApprovalKind = (promptType: TApprovalPromptType, options: string[]): TApprovalKind => {
  if (promptType === 'resume-directory') return 'directory';
  if (promptType === 'conversation') return 'input';
  if (promptType === 'permission') return hasOption(options, 'Accept') ? 'trust' : 'allow';
  if (promptType === 'command' || promptType === 'file') return hasOption(options, 'No') ? 'allow' : 'unknown';
  return 'unknown';
};

const classifyRiskLevel = (text: string, promptType: TApprovalPromptType, options: string[]): TApprovalRiskLevel => {
  const joined = `${text}\n${options.join('\n')}`;
  if (/yes,\s*and\s+don[\u2019']?t\s+ask again/i.test(joined) || /bypass permissions/i.test(joined) || DESTRUCTIVE_COMMAND_RE.test(joined)) return 'high';
  if (promptType === 'command' || promptType === 'file' || promptType === 'permission') return 'medium';
  if (promptType === 'resume-directory' || promptType === 'conversation') return 'low';
  return 'unknown';
};

const buildApprovalPromptMetadata = (paneContent: string, options: string[]): IApprovalPromptMetadata => {
  if (options.length === 0) return createEmptyApprovalPromptMetadata();
  const promptType = classifyPromptType(paneContent, options);
  return {
    promptType,
    approvalKind: classifyApprovalKind(promptType, options),
    riskLevel: classifyRiskLevel(paneContent, promptType, options),
    commandPreview: extractCommandPreview(options.join('\n')),
    fileHints: extractFileHints(paneContent),
    fallbackReason: null,
  };
};
```

- [ ] **Step 5: Return metadata from `parsePermissionOptions()`**

Change the signature and return statements in `src/lib/permission-prompt.ts`.

```typescript
export const parsePermissionOptions = (paneContent: string): IPermissionPromptParseResult => {
  const lines = paneContent.split('\n');

  const numbered = parseNumberedOptions(lines);
  if (numbered.options.length >= 2 && isKnownPromptPattern(numbered.options)) {
    return {
      ...numbered,
      metadata: buildApprovalPromptMetadata(paneContent, numbered.options),
    };
  }

  const keyword = parseKeywordOptions(lines);
  if (!isKnownPromptPattern(keyword.options)) {
    return { options: [], focusedIndex: 0, metadata: createEmptyApprovalPromptMetadata() };
  }
  return {
    ...keyword,
    metadata: buildApprovalPromptMetadata(paneContent, keyword.options),
  };
};
```

Leave `hasPermissionPrompt()` unchanged except for using the new result shape.

```typescript
export const hasPermissionPrompt = (paneContent: string): boolean =>
  parsePermissionOptions(paneContent).options.length > 0;
```

- [ ] **Step 6: Run parser tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts
```

Expected: PASS.

---

### Task 2: Permission Options API Metadata

**Files:**
- Modify: `src/pages/api/tmux/permission-options.ts`
- Create: `tests/unit/pages/permission-options-api.test.ts`

- [ ] **Step 1: Add API tests**

Create `tests/unit/pages/permission-options-api.test.ts`.

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  capturePaneAtWidth: vi.fn(),
}));

vi.mock('@/lib/tmux', () => ({
  hasSession: mocks.hasSession,
}));

vi.mock('@/lib/capture-at-width', () => ({
  capturePaneAtWidth: mocks.capturePaneAtWidth,
}));

import handler from '@/pages/api/tmux/permission-options';

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, number | string | string[]> = {};
  const res = {
    setHeader: vi.fn((name: string, value: number | string | string[]) => {
      headers[name] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
  } as unknown as NextApiResponse;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    headers,
  };
};

const createRequest = (input: {
  method?: string;
  query?: Record<string, string | undefined>;
}): NextApiRequest => ({
  method: input.method ?? 'GET',
  query: input.query ?? {},
}) as NextApiRequest;

describe('/api/tmux/permission-options', () => {
  beforeEach(() => {
    mocks.hasSession.mockReset();
    mocks.capturePaneAtWidth.mockReset();
    mocks.hasSession.mockResolvedValue(true);
  });

  it('returns options, focused index, and sanitized metadata', async () => {
    mocks.capturePaneAtWidth.mockResolvedValue([
      'Would you like to run the following command?',
      '  1. Yes',
      "  2. Yes, and don't ask again for commands that start with `touch /tmp/approval-secret`",
      '  3. No',
    ].join('\n'));
    const response = createResponse();

    await handler(createRequest({ query: { session: 'pt-session' } }), response.res);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      options: [
        '1. Yes',
        "2. Yes, and don't ask again for commands that start with `touch /tmp/approval-secret`",
        '3. No',
      ],
      focusedIndex: 0,
      metadata: {
        promptType: 'command',
        approvalKind: 'allow',
        riskLevel: 'high',
        fallbackReason: null,
      },
    });
    expect(JSON.stringify((response.body as { metadata: unknown }).metadata)).not.toContain('/tmp/approval-secret');
  });

  it('keeps empty capture compatible with an empty option list', async () => {
    mocks.capturePaneAtWidth.mockResolvedValue('');
    const response = createResponse();

    await handler(createRequest({ query: { session: 'pt-session' } }), response.res);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      options: [],
      focusedIndex: 0,
      captureEmpty: true,
      metadata: {
        promptType: 'unknown',
        approvalKind: 'unknown',
        riskLevel: 'unknown',
        commandPreview: null,
        fileHints: [],
        fallbackReason: null,
      },
    });
  });

  it('preserves existing not found and method behavior', async () => {
    const methodResponse = createResponse();
    await handler(createRequest({ method: 'POST', query: { session: 'pt-session' } }), methodResponse.res);
    expect(methodResponse.statusCode).toBe(405);
    expect(methodResponse.headers.Allow).toBe('GET');

    mocks.hasSession.mockResolvedValue(false);
    const missingResponse = createResponse();
    await handler(createRequest({ query: { session: 'pt-session' } }), missingResponse.res);
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.body).toEqual({ error: 'Session not found' });
  });
});
```

- [ ] **Step 2: Run API tests and verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/pages/permission-options-api.test.ts
```

Expected: FAIL because the API does not return `focusedIndex` or `metadata`.

- [ ] **Step 3: Update the API handler**

In `src/pages/api/tmux/permission-options.ts`, keep the imports and replace the response logic after capture with this shape.

```typescript
import { createEmptyApprovalPromptMetadata, parsePermissionOptions } from '@/lib/permission-prompt';
```

Use this response block inside the `try` body.

```typescript
const content = await capturePaneAtWidth(session, 120, 50);
if (!content) {
  return res.status(200).json({
    options: [],
    focusedIndex: 0,
    captureEmpty: true,
    metadata: createEmptyApprovalPromptMetadata(),
  });
}

const { options, focusedIndex, metadata } = parsePermissionOptions(content);
const isBypassPrompt = content.includes('Bypass Permissions');
return res.status(200).json({
  options,
  focusedIndex,
  metadata,
  ...(isBypassPrompt && { isBypassPrompt: true }),
});
```

- [ ] **Step 4: Run parser and API tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/pages/permission-options-api.test.ts
```

Expected: PASS.

---

### Task 3: Approval Queue Helpers And Locale Copy

**Files:**
- Modify: `src/lib/approval-queue.ts`
- Modify: `tests/unit/lib/approval-queue.test.ts`
- Modify: `messages/ko/notification.json`
- Modify: `messages/en/notification.json`

- [ ] **Step 1: Add helper tests**

Extend `tests/unit/lib/approval-queue.test.ts`.

```typescript
import type { IApprovalPromptMetadata } from '@/lib/permission-prompt';
```

Add these tests inside `describe('approval queue helpers', () => { ... })`.

```typescript
it('maps prompt metadata to locale keys', () => {
  expect(getApprovalPromptTypeKey('command')).toBe('approvalType_command');
  expect(getApprovalPromptTypeKey('file')).toBe('approvalType_file');
  expect(getApprovalPromptTypeKey('permission')).toBe('approvalType_permission');
  expect(getApprovalPromptTypeKey('resume-directory')).toBe('approvalType_resumeDirectory');
  expect(getApprovalPromptTypeKey('conversation')).toBe('approvalType_conversation');
  expect(getApprovalPromptTypeKey('unknown')).toBe('approvalType_unknown');
});

it('maps risk and fallback reasons to locale keys', () => {
  expect(getApprovalRiskKey('high')).toBe('approvalRisk_high');
  expect(getApprovalRiskKey('medium')).toBe('approvalRisk_medium');
  expect(getApprovalRiskKey('low')).toBe('approvalRisk_low');
  expect(getApprovalRiskKey('unknown')).toBe('approvalRisk_unknown');
  expect(getApprovalFallbackKey('no-session')).toBe('approvalFallback_noSession');
  expect(getApprovalFallbackKey('capture-empty')).toBe('approvalFallback_captureEmpty');
  expect(getApprovalFallbackKey('parse-empty')).toBe('approvalFallback_parseEmpty');
  expect(getApprovalFallbackKey('send-failed')).toBe('approvalFallback_sendFailed');
  expect(getApprovalFallbackKey('request-failed')).toBe('approvalFallback_requestFailed');
});

it('builds compact metadata detail text without leaking paths', () => {
  const metadata: IApprovalPromptMetadata = {
    promptType: 'command',
    approvalKind: 'allow',
    riskLevel: 'medium',
    commandPreview: 'corepack pnpm test',
    fileHints: [],
    fallbackReason: null,
  };

  expect(getApprovalMetadataDetail(metadata)).toBe('corepack pnpm test');
  expect(getApprovalMetadataDetail({
    ...metadata,
    promptType: 'file',
    commandPreview: null,
    fileHints: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
  })).toBe('a.ts, b.ts, c.ts +1');
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts
```

Expected: FAIL because the mapping helpers do not exist.

- [ ] **Step 3: Add helper types and mappings**

In `src/lib/approval-queue.ts`, add imports and helpers.

```typescript
import type {
  IApprovalPromptMetadata,
  TApprovalPromptType,
  TApprovalRiskLevel,
} from '@/lib/permission-prompt';

export type TApprovalFallbackReason =
  | 'no-session'
  | 'capture-empty'
  | 'parse-empty'
  | 'send-failed'
  | 'request-failed';

const promptTypeKeys: Record<TApprovalPromptType, string> = {
  command: 'approvalType_command',
  file: 'approvalType_file',
  permission: 'approvalType_permission',
  'resume-directory': 'approvalType_resumeDirectory',
  conversation: 'approvalType_conversation',
  unknown: 'approvalType_unknown',
};

const riskKeys: Record<TApprovalRiskLevel, string> = {
  high: 'approvalRisk_high',
  medium: 'approvalRisk_medium',
  low: 'approvalRisk_low',
  unknown: 'approvalRisk_unknown',
};

const fallbackKeys: Record<TApprovalFallbackReason, string> = {
  'no-session': 'approvalFallback_noSession',
  'capture-empty': 'approvalFallback_captureEmpty',
  'parse-empty': 'approvalFallback_parseEmpty',
  'send-failed': 'approvalFallback_sendFailed',
  'request-failed': 'approvalFallback_requestFailed',
};

export const getApprovalPromptTypeKey = (type: TApprovalPromptType): string =>
  promptTypeKeys[type] ?? promptTypeKeys.unknown;

export const getApprovalRiskKey = (risk: TApprovalRiskLevel): string =>
  riskKeys[risk] ?? riskKeys.unknown;

export const getApprovalFallbackKey = (reason: TApprovalFallbackReason): string =>
  fallbackKeys[reason] ?? fallbackKeys['request-failed'];

export const getApprovalMetadataDetail = (metadata: IApprovalPromptMetadata | null): string | null => {
  if (!metadata) return null;
  if (metadata.commandPreview) return metadata.commandPreview;
  if (metadata.fileHints.length === 0) return null;
  const visible = metadata.fileHints.slice(0, 3);
  const extra = metadata.fileHints.length - visible.length;
  return extra > 0 ? `${visible.join(', ')} +${extra}` : visible.join(', ');
};
```

- [ ] **Step 4: Add locale copy**

Add these keys to `messages/ko/notification.json`.

```json
"approvalType_command": "명령",
"approvalType_file": "파일",
"approvalType_permission": "권한",
"approvalType_resumeDirectory": "디렉터리",
"approvalType_conversation": "대화",
"approvalType_unknown": "입력",
"approvalRisk_high": "높음",
"approvalRisk_medium": "보통",
"approvalRisk_low": "낮음",
"approvalRisk_unknown": "확인 필요",
"approvalFallback_noSession": "세션 정보를 찾을 수 없습니다",
"approvalFallback_captureEmpty": "터미널 출력이 비어 있습니다",
"approvalFallback_parseEmpty": "선택지를 읽을 수 없습니다",
"approvalFallback_sendFailed": "선택 전달에 실패했습니다",
"approvalFallback_requestFailed": "승인 상태를 불러오지 못했습니다"
```

Add these keys to `messages/en/notification.json`.

```json
"approvalType_command": "Command",
"approvalType_file": "File",
"approvalType_permission": "Permission",
"approvalType_resumeDirectory": "Directory",
"approvalType_conversation": "Conversation",
"approvalType_unknown": "Input",
"approvalRisk_high": "High",
"approvalRisk_medium": "Medium",
"approvalRisk_low": "Low",
"approvalRisk_unknown": "Check",
"approvalFallback_noSession": "Session is unavailable",
"approvalFallback_captureEmpty": "Terminal capture is empty",
"approvalFallback_parseEmpty": "Could not read approval options",
"approvalFallback_sendFailed": "Failed to send selection",
"approvalFallback_requestFailed": "Failed to load approval state"
```

Keep the existing `approvalFallback` and `approvalSendFailed` keys for backward-compatible copy.

- [ ] **Step 5: Run helper tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts
```

Expected: PASS.

---

### Task 4: Approval Queue UI Metadata

**Files:**
- Modify: `src/components/features/workspace/approval-queue-item.tsx`

- [ ] **Step 1: Update fetched response type**

In `src/components/features/workspace/approval-queue-item.tsx`, import metadata types and helper mappings.

```typescript
import type { IApprovalPromptMetadata } from '@/lib/permission-prompt';
```

Extend the approval queue helper import.

```typescript
  getApprovalFallbackKey,
  getApprovalMetadataDetail,
  getApprovalPromptTypeKey,
  getApprovalRiskKey,
  type TApprovalFallbackReason,
```

Add this local response type.

```typescript
interface IApprovalOptionsResponse {
  options: string[];
  metadata: IApprovalPromptMetadata | null;
  captureEmpty: boolean;
  fallbackReason: TApprovalFallbackReason | null;
}
```

- [ ] **Step 2: Return metadata and fallback reasons from fetch**

Replace `fetchPermissionOptions()` with:

```typescript
const fetchPermissionOptions = async (sessionName: string): Promise<IApprovalOptionsResponse> => {
  const maxAttempts = 12;
  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let options: string[] = [];
    let metadata: IApprovalPromptMetadata | null = null;
    let captureEmpty = false;
    let requestFailed = false;
    try {
      const res = await fetch(`/api/tmux/permission-options?session=${encodeURIComponent(sessionName)}`);
      if (res.ok) {
        const data = await res.json() as { options?: unknown; metadata?: unknown; captureEmpty?: unknown };
        options = Array.isArray(data.options) ? data.options.filter((option): option is string => typeof option === 'string') : [];
        metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata as IApprovalPromptMetadata : null;
        captureEmpty = data.captureEmpty === true;
      } else {
        requestFailed = true;
      }
    } catch {
      requestFailed = true;
    }

    if (!shouldRetryApprovalOptions({ options, attempt, maxAttempts })) {
      return {
        options,
        metadata,
        captureEmpty,
        fallbackReason: hasUsableApprovalOptions(options) ? null : requestFailed ? 'request-failed' : captureEmpty ? 'capture-empty' : 'parse-empty',
      };
    }
    await delay(300);
  }

  return { options: [], metadata: null, captureEmpty: false, fallbackReason: 'parse-empty' };
};
```

- [ ] **Step 3: Track metadata in component state**

Add state near the existing `options` state.

```typescript
const [metadata, setMetadata] = useState<IApprovalPromptMetadata | null>(null);
const [fallbackReason, setFallbackReason] = useState<TApprovalFallbackReason | null>(null);
```

In the reset block inside `useEffect()`, add:

```typescript
setMetadata(null);
setFallbackReason(null);
```

In the no-session branch, set the fallback reason.

```typescript
if (!sessionName) {
  setFallbackReason('no-session');
  setPhase('failed');
  return () => { cancelled = true; };
}
```

Replace the success path in `fetchPermissionOptions(sessionName).then(...)` with:

```typescript
fetchPermissionOptions(sessionName)
  .then((result) => {
    if (cancelled) return;
    setMetadata(result.metadata);
    if (!hasUsableApprovalOptions(result.options)) {
      setFallbackReason(result.fallbackReason ?? 'parse-empty');
      setPhase('failed');
      return;
    }
    setOptions(result.options);
    setPhase('ready');
  })
  .catch(() => {
    if (!cancelled) {
      setFallbackReason('request-failed');
      setPhase('failed');
    }
  });
```

In `handleSelect()`, set `send-failed` on failure.

```typescript
if (!ok) {
  setSelectedIndex(null);
  setFallbackReason('send-failed');
  toast.error(t(getApprovalFallbackKey('send-failed')));
  return;
}
```

- [ ] **Step 4: Render prompt type, risk, and detail line**

Add this memo before `handleNavigate`.

```typescript
const metadataDetail = useMemo(() => getApprovalMetadataDetail(metadata), [metadata]);
```

Inside the card header, below the prompt text, render metadata badges when metadata exists.

```tsx
{metadata && (
  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
    <span className="rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t(getApprovalPromptTypeKey(metadata.promptType))}
    </span>
    <span className={cn(
      'rounded border px-1.5 py-0.5 text-[11px] font-medium',
      metadata.riskLevel === 'high'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : metadata.riskLevel === 'medium'
          ? 'border-ui-amber/30 bg-ui-amber/10 text-ui-amber'
          : 'border-border/60 bg-muted text-muted-foreground',
    )}>
      {t(getApprovalRiskKey(metadata.riskLevel))}
    </span>
  </div>
)}
{metadataDetail && (
  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
    {metadataDetail}
  </p>
)}
```

In failed state, replace the fallback text:

```tsx
<span className="truncate">
  {t(getApprovalFallbackKey(fallbackReason ?? 'request-failed'))}
</span>
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts
corepack pnpm tsc --noEmit
```

Expected: PASS.

---

### Task 5: Web Push Metadata

**Files:**
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Add compact push metadata helper**

In `src/lib/status-manager.ts`, add a private helper near `sendWebPush()` or a small local block inside `sendWebPush()`. It should not capture pane output; it only forwards safe metadata already on the status entry if present in a future state. Since current `ITabStatusEntry` does not store approval metadata, this slice sends explicit unknown defaults for `needs-input`.

```typescript
const approvalPushMetadata = pushType === 'needs-input'
  ? {
      approvalKind: 'unknown',
      promptType: 'unknown',
      riskLevel: 'unknown',
    }
  : {};
```

Add it to the payload object.

```typescript
const payload = JSON.stringify({
  title,
  body,
  silent: pushType === 'review' && config.soundOnCompleteEnabled === false,
  tabId,
  workspaceId: entry.workspaceId,
  agentSessionId: entry.agentSessionId ?? null,
  workspaceName: ws?.name ?? '',
  workspaceDir: ws?.directories[0] ?? null,
  ...approvalPushMetadata,
});
```

This keeps routing unchanged and avoids doing tmux capture in the push send path.

- [ ] **Step 2: Verify push navigation code does not need a route change**

Confirm `src/hooks/use-web-push.ts` still reads only:

```typescript
workspaceId
tabId
agentSessionId
workspaceName
workspaceDir
```

No code change is required there for this slice.

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

---

### Task 6: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update status documentation**

In `docs/STATUS.md`, update the notification section to state:

```markdown
- 전역 approval queue는 pane capture에서 파싱한 option list와 sanitized metadata를 표시한다.
  metadata는 `command`, `file`, `permission`, `resume-directory`, `conversation`, `unknown`
  prompt type과 `low|medium|high|unknown` risk enum만 포함한다. full command, cwd,
  session name, JSONL path, prompt body, assistant text, terminal output은 status payload나
  Web Push payload에 넣지 않는다.
```

- [ ] **Step 2: Update testing documentation**

In `docs/TESTING.md`, extend the permission prompt section with:

````markdown
Approval queue metadata 변경의 최소 검증:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/pages/permission-options-api.test.ts
corepack pnpm smoke:permission
```

이 검증은 command/file/permission/resume/conversation prompt metadata, 민감정보 비노출,
기존 option index 선택, `needs-input -> busy` ack 전이를 확인한다.
````

- [ ] **Step 3: Update follow-up documentation**

In `docs/FOLLOW-UP.md`, update the approval workflow backlog so it says:

```markdown
- approval queue metadata slice는 command/file/permission/resume/conversation type, approval
  kind, risk badge, sanitized command/file detail을 전역 notification panel에 표시한다. 다음
  단계는 mobile push copy/deep link와 durable audit history를 별도 spec으로 검토한다.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/permission-prompt.test.ts tests/unit/lib/approval-queue.test.ts tests/unit/pages/permission-options-api.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
corepack pnpm smoke:permission
git diff --check
```

Expected:

- focused vitest passes
- typecheck passes
- lint passes
- production build passes
- permission smoke passes
- diff check reports no whitespace errors

- [ ] **Step 5: Commit only after explicit user request**

When the user explicitly requests commit/push, use:

```bash
git add src/lib/permission-prompt.ts tests/unit/lib/permission-prompt.test.ts src/pages/api/tmux/permission-options.ts tests/unit/pages/permission-options-api.test.ts src/lib/approval-queue.ts tests/unit/lib/approval-queue.test.ts src/components/features/workspace/approval-queue-item.tsx messages/ko/notification.json messages/en/notification.json src/lib/status-manager.ts docs/STATUS.md docs/TESTING.md docs/FOLLOW-UP.md docs/superpowers/specs/2026-05-05-approval-queue-metadata-design.md docs/superpowers/plans/2026-05-05-approval-queue-metadata.md
git commit -m "Enhance approval queue metadata"
git push
```

Do not run these commands during plan execution unless the user has explicitly requested commit/push.

---

## Self-Review

- Spec coverage: parser metadata, API compatibility, approval queue UI, Web Push metadata, docs, and validation are each mapped to a task.
- Placeholder scan: no unresolved marker steps remain.
- Type consistency: `TApprovalPromptType`, `TApprovalKind`, `TApprovalRiskLevel`, `IApprovalPromptMetadata`, and `TApprovalFallbackReason` are defined before use.
- Scope control: durable approval DB, full command preview, Status Worker ownership, and executable lifecycle control are excluded.
