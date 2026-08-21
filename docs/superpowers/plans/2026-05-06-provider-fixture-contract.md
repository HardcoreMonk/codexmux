# Provider Fixture Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the Codex provider contract with reusable fixtures so later timeline/status splits, app-server adapter work, and fork/sub-agent UI can rely on stable provider behavior.

**Architecture:** Add sanitized Codex JSONL fixtures under `tests/fixtures/providers/codex/` and extend `tests/unit/lib/providers.test.ts` to verify stable parser output, paired-message dedupe, chunk reads, incremental reads, and explicit provider capability shape. Keep production provider behavior unchanged.

**Tech Stack:** TypeScript, Vitest, Node `fs/promises`, existing `IAgentProvider`, existing Codex JSONL parser.

---

## File Structure

- Create: `tests/fixtures/providers/codex/basic-turn.jsonl`
  Basic user, assistant, reasoning, tool call, and tool result fixture.
- Create: `tests/fixtures/providers/codex/paired-dedupe.jsonl`
  Paired `event_msg.agent_message` and `response_item.message` fixture.
- Create: `tests/fixtures/providers/codex/session-metadata.jsonl`
  Session metadata and synthetic context fixture that must not emit user-visible synthetic context entries.
- Modify: `tests/unit/lib/providers.test.ts`
  Add fixture loader helpers and provider contract tests.
- Modify: `docs/FOLLOW-UP.md`
  Mark provider fixture/contract strengthening as started or complete after verification.

## Task 1: Add Codex Provider Fixtures

**Files:**
- Create: `tests/fixtures/providers/codex/basic-turn.jsonl`
- Create: `tests/fixtures/providers/codex/paired-dedupe.jsonl`
- Create: `tests/fixtures/providers/codex/session-metadata.jsonl`

- [ ] **Step 1: Create `basic-turn.jsonl`**

Create `tests/fixtures/providers/codex/basic-turn.jsonl` with exactly these lines:

```jsonl
{"type":"event_msg","timestamp":"2026-05-06T00:00:00.000Z","payload":{"type":"user_message","message":"Implement provider contract tests"}}
{"type":"response_item","timestamp":"2026-05-06T00:00:01.000Z","payload":{"type":"reasoning","summary":["Need stable provider fixtures"],"content":null}}
{"type":"response_item","timestamp":"2026-05-06T00:00:02.000Z","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"corepack pnpm test tests/unit/lib/providers.test.ts\",\"workdir\":\"/repo\"}","call_id":"call_provider_test"}}
{"type":"response_item","timestamp":"2026-05-06T00:00:03.000Z","payload":{"type":"function_call_output","call_id":"call_provider_test","output":"Process exited with code 0\nOutput:\nprovider tests passed"}}
{"type":"event_msg","timestamp":"2026-05-06T00:00:04.000Z","payload":{"type":"agent_message","message":"Provider contract tests are stable","phase":"final"}}
```

- [ ] **Step 2: Create `paired-dedupe.jsonl`**

Create `tests/fixtures/providers/codex/paired-dedupe.jsonl` with exactly these lines:

```jsonl
{"type":"event_msg","timestamp":"2026-05-06T00:01:00.000Z","payload":{"type":"agent_message","message":"Reading provider files","phase":"commentary"}}
{"type":"response_item","timestamp":"2026-05-06T00:01:00.120Z","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Reading provider files"}],"phase":"commentary"}}
{"type":"event_msg","timestamp":"2026-05-06T00:01:01.000Z","payload":{"type":"user_message","message":"Continue"}}
```

- [ ] **Step 3: Create `session-metadata.jsonl`**

Create `tests/fixtures/providers/codex/session-metadata.jsonl` with exactly these lines:

```jsonl
{"type":"session_meta","timestamp":"2026-05-06T00:02:00.000Z","payload":{"id":"12345678-1234-1234-1234-123456789abc","cwd":"/repo","model":"gpt-5.3-codex"}}
{"type":"turn_context","timestamp":"2026-05-06T00:02:01.000Z","payload":{"cwd":"/repo","model":"gpt-5.3-codex"}}
{"type":"response_item","timestamp":"2026-05-06T00:02:02.000Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\ninternal rules\n</INSTRUCTIONS>"},{"type":"input_text","text":"<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>"}]}}
{"type":"response_item","timestamp":"2026-05-06T00:02:03.000Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Show status"}]}}
{"type":"response_item","timestamp":"2026-05-06T00:02:04.000Z","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Status is clean"}]}}
```

- [ ] **Step 4: Verify fixture files are valid JSONL**

Run:

```bash
node -e "const fs=require('fs'); for (const file of ['tests/fixtures/providers/codex/basic-turn.jsonl','tests/fixtures/providers/codex/paired-dedupe.jsonl','tests/fixtures/providers/codex/session-metadata.jsonl']) { fs.readFileSync(file,'utf8').trim().split('\n').forEach((line)=>JSON.parse(line)); }"
```

Expected: command exits 0 with no output.

## Task 2: Extend Provider Contract Tests

**Files:**
- Modify: `tests/unit/lib/providers.test.ts`

- [ ] **Step 1: Add fixture imports and helpers**

At the top of `tests/unit/lib/providers.test.ts`, add these imports after the existing Vitest import:

```typescript
import fs from 'fs/promises';
import path from 'path';
```

Add these helpers after `const codexLine = ...`:

```typescript
const readProviderFixture = (name: string): Promise<string> =>
  fs.readFile(path.join(process.cwd(), 'tests/fixtures/providers/codex', name), 'utf-8');

const getCodexProvider = () => {
  const provider = getProviderByPanelType('codex');
  expect(provider).not.toBeNull();
  return provider!;
};
```

- [ ] **Step 2: Add failing test for basic fixture parsing**

Append this test inside the `describe('agent providers', () => { ... })` block:

```typescript
  it('parses the Codex basic-turn fixture through the provider contract', async () => {
    const provider = getCodexProvider();
    const content = await readProviderFixture('basic-turn.jsonl');
    const entries = provider.parseJsonlContent(content);

    expect(entries.map((entry) => entry.type)).toEqual([
      'user-message',
      'thinking',
      'tool-call',
      'tool-result',
      'assistant-message',
    ]);
    expect(entries[0]).toMatchObject({
      type: 'user-message',
      text: 'Implement provider contract tests',
    });
    expect(entries[1]).toMatchObject({
      type: 'thinking',
      thinking: 'Need stable provider fixtures',
    });
    expect(entries[2]).toMatchObject({
      type: 'tool-call',
      toolUseId: 'call_provider_test',
      toolName: 'exec_command',
      status: 'success',
    });
    expect(entries[3]).toMatchObject({
      type: 'tool-result',
      toolUseId: 'call_provider_test',
      isError: false,
    });
    expect(entries[4]).toMatchObject({
      type: 'assistant-message',
      markdown: 'Provider contract tests are stable',
    });
    expect(provider.parseJsonlContent(content).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
  });
```

- [ ] **Step 3: Add failing test for paired dedupe fixture**

Append this test:

```typescript
  it('dedupes paired assistant messages through the provider contract', async () => {
    const provider = getCodexProvider();
    const content = await readProviderFixture('paired-dedupe.jsonl');
    const entries = provider.parseJsonlContent(content);

    expect(entries.map((entry) => entry.type)).toEqual(['assistant-message', 'user-message']);
    expect(entries[0]).toMatchObject({
      type: 'assistant-message',
      markdown: 'Reading provider files',
    });
    expect(entries.filter((entry) => entry.type === 'assistant-message')).toHaveLength(1);
  });
```

- [ ] **Step 4: Add failing test for metadata fixture synthetic context filtering**

Append this test:

```typescript
  it('keeps session metadata from producing synthetic visible timeline entries', async () => {
    const provider = getCodexProvider();
    const content = await readProviderFixture('session-metadata.jsonl');
    const entries = provider.parseJsonlContent(content);

    expect(entries.map((entry) => entry.type)).toEqual(['user-message', 'assistant-message']);
    expect(entries[0]).toMatchObject({ type: 'user-message', text: 'Show status' });
    expect(entries[1]).toMatchObject({ type: 'assistant-message', markdown: 'Status is clean' });
    expect(JSON.stringify(entries)).not.toContain('AGENTS.md');
    expect(JSON.stringify(entries)).not.toContain('environment_context');
  });
```

- [ ] **Step 5: Add failing test for provider chunk and incremental reads**

Append this test:

```typescript
  it('supports provider tail, read-before, and incremental fixture reads', async () => {
    const provider = getCodexProvider();
    const filePath = path.join(process.cwd(), 'tests/fixtures/providers/codex/basic-turn.jsonl');
    const fullContent = await fs.readFile(filePath, 'utf-8');
    const firstNewline = fullContent.indexOf('\n') + 1;

    const tail = await provider.readTailEntries(filePath, 2);
    expect(tail.entries.map((entry) => entry.type)).toEqual(['tool-result', 'assistant-message']);
    expect(tail.hasMore).toBe(true);
    expect(tail.fileSize).toBe(Buffer.byteLength(fullContent, 'utf-8'));

    const before = await provider.readEntriesBefore(filePath, tail.startByteOffset, 10);
    expect(before.entries.map((entry) => entry.type)).toEqual(['user-message', 'thinking', 'tool-call']);

    const incremental = await provider.parseIncremental(filePath, firstNewline);
    expect(incremental.newEntries.map((entry) => entry.type)).toEqual([
      'thinking',
      'tool-call',
      'tool-result',
      'assistant-message',
    ]);
    expect(incremental.newOffset).toBe(Buffer.byteLength(fullContent, 'utf-8'));
    expect(incremental.pendingBuffer).toBe('');
  });
```

- [ ] **Step 6: Run tests to verify they fail before fixtures/helpers exist**

Run:

```bash
corepack pnpm test tests/unit/lib/providers.test.ts
```

Expected: FAIL before Task 1 fixtures are present, or before helper/test imports are correctly applied. Failure should point to missing fixture files or missing helper symbols, not unrelated provider behavior.

## Task 3: Make Provider Contract Tests Pass

**Files:**
- Create: `tests/fixtures/providers/codex/basic-turn.jsonl`
- Create: `tests/fixtures/providers/codex/paired-dedupe.jsonl`
- Create: `tests/fixtures/providers/codex/session-metadata.jsonl`
- Modify: `tests/unit/lib/providers.test.ts`

- [ ] **Step 1: Apply fixture files from Task 1**

Create the three fixture files exactly as shown in Task 1.

- [ ] **Step 2: Apply provider test imports and helpers from Task 2**

Modify `tests/unit/lib/providers.test.ts` exactly as shown in Task 2 Step 1.

- [ ] **Step 3: Apply provider fixture tests from Task 2**

Append the four tests from Task 2 Steps 2~5.

- [ ] **Step 4: Run focused provider tests**

Run:

```bash
corepack pnpm test tests/unit/lib/providers.test.ts
```

Expected: PASS. The output should include 1 passed file and all provider tests passing.

- [ ] **Step 5: Run parser regression tests**

Run:

```bash
corepack pnpm test tests/unit/lib/codex-session-parser.test.ts tests/unit/lib/timeline-entry-dedupe.test.ts tests/unit/lib/timeline-entry-merge.test.ts
```

Expected: PASS. This confirms the provider fixture assertions still align with parser-level behavior.

## Task 4: Update Follow-Up Documentation

**Files:**
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update provider backlog note**

In `docs/FOLLOW-UP.md`, under `## Post-MVP 백로그` -> `### Architecture modularization`, replace:

```markdown
- provider를 추가할 때는 `IAgentProvider` contract test와 JSONL fixture를 먼저 추가한다.
```

with:

```markdown
- provider 확장 안전망은 `tests/fixtures/providers/codex/` JSONL fixtures와 `tests/unit/lib/providers.test.ts` contract coverage로 시작한다. 새 provider나 app-server adapter는 같은 fixture contract를 통과한 뒤 experimental registry에 들어간다.
```

- [ ] **Step 2: Run docs grep**

Run:

```bash
rg -n "fixtures/providers/codex|provider 확장 안전망|IAgentProvider" docs/FOLLOW-UP.md tests/unit/lib/providers.test.ts tests/fixtures/providers/codex
```

Expected: output includes the updated follow-up line, provider test references, and fixture paths.

## Task 5: Final Verification

**Files:**
- No new source edits after this task unless verification fails.

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm test tests/unit/lib/providers.test.ts tests/unit/lib/codex-session-parser.test.ts tests/unit/lib/timeline-entry-dedupe.test.ts tests/unit/lib/timeline-entry-merge.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only the provider fixture/contract files, this plan/spec if not already committed, and pre-existing unrelated operations batch changes should appear. Do not revert unrelated pre-existing changes.

- [ ] **Step 5: Commit checkpoint only after explicit user commit approval**

When the user explicitly requests commit:

```bash
git add tests/fixtures/providers/codex/basic-turn.jsonl tests/fixtures/providers/codex/paired-dedupe.jsonl tests/fixtures/providers/codex/session-metadata.jsonl tests/unit/lib/providers.test.ts docs/FOLLOW-UP.md docs/superpowers/plans/2026-05-06-provider-fixture-contract.md
git commit -m "test: strengthen provider fixture contract"
```

Expected: commit succeeds. Do not push unless the user explicitly asks.

## Self-Review

- Spec coverage: this plan covers Workstream 1 only, as approved during grill-me. Workstreams 2~4 remain separate follow-up plans.
- Placeholder scan: no Task step uses open-ended TODO/TBD language; fixture contents and test snippets are explicit.
- Type consistency: snippets use existing `IAgentProvider` methods, existing `ITimelineEntry` type names, and existing parser output fields.
- Safety: fixtures are synthetic and contain no secrets, auth tokens, real cwd, or real JSONL paths.
