# Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global approval queue in the notification panel for Codex permission prompts.

**Architecture:** Keep the existing `needs-input` state and status WebSocket ack flow. Add a focused queue item component that looks up the local tab `sessionName`, fetches permission options from the existing tmux capture endpoint, sends the selected option to the existing tmux input endpoint, then acks the notification event. Server status payload remains unchanged.

**Tech Stack:** Next.js Pages Router, TypeScript, React, Zustand stores, existing shadcn sheet/button, Vitest for pure helpers, Playwright-backed `smoke:permission` for end-to-end behavior.

---

### Task 1: Shared Approval Queue Helpers

**Files:**
- Create: `src/lib/approval-queue.ts`
- Test: `tests/unit/lib/approval-queue.test.ts`

- [ ] **Step 1: Write helper tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  cleanApprovalOptionLabel,
  getApprovalQueueFallbackText,
  hasUsableApprovalOptions,
} from '@/lib/approval-queue';

describe('approval queue helpers', () => {
  it('removes numeric option prefixes from permission labels', () => {
    expect(cleanApprovalOptionLabel('1. Yes, allow it')).toBe('Yes, allow it');
    expect(cleanApprovalOptionLabel('No')).toBe('No');
  });

  it('detects non-empty option lists', () => {
    expect(hasUsableApprovalOptions(['1. Yes'])).toBe(true);
    expect(hasUsableApprovalOptions(['', '   '])).toBe(false);
    expect(hasUsableApprovalOptions([])).toBe(false);
  });

  it('uses last prompt text before falling back to tab name', () => {
    expect(getApprovalQueueFallbackText({ lastUserMessage: 'Run tests?', tabName: 'codex' })).toBe('Run tests?');
    expect(getApprovalQueueFallbackText({ lastUserMessage: null, tabName: 'codex' })).toBe('codex');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts`

Expected: fails because `src/lib/approval-queue.ts` does not exist.

- [ ] **Step 3: Implement helpers**

```typescript
export const cleanApprovalOptionLabel = (label: string): string =>
  label.replace(/^\d+\.\s+/, '').trim();

export const hasUsableApprovalOptions = (options: string[]): boolean =>
  options.some((option) => option.trim().length > 0);

export const getApprovalQueueFallbackText = (input: {
  lastUserMessage?: string | null;
  tabName: string;
}): string => {
  const prompt = input.lastUserMessage?.trim();
  return prompt || input.tabName;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts`

Expected: all tests pass.

### Task 2: Approval Queue Item Component

**Files:**
- Create: `src/components/features/workspace/approval-queue-item.tsx`
- Modify: `messages/ko/notification.json`
- Modify: `messages/en/notification.json`

- [ ] **Step 1: Create the component**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  cleanApprovalOptionLabel,
  getApprovalQueueFallbackText,
  hasUsableApprovalOptions,
} from '@/lib/approval-queue';
import { ackNotificationInput } from '@/hooks/use-agent-status';

type TApprovalPhase = 'loading' | 'ready' | 'failed';

interface IApprovalQueueItemProps {
  tabId: string;
  sessionName: string | null;
  workspaceId: string;
  workspaceName: string;
  tabName: string;
  lastUserMessage?: string | null;
  lastEventSeq?: number;
  isActiveTab?: boolean;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}

const fetchPermissionOptions = async (sessionName: string): Promise<string[]> => {
  const res = await fetch(`/api/tmux/permission-options?session=${encodeURIComponent(sessionName)}`);
  if (!res.ok) return [];
  const data = await res.json() as { options?: string[] };
  return Array.isArray(data.options) ? data.options : [];
};

const sendSelection = async (sessionName: string, optionIndex: number): Promise<boolean> => {
  const res = await fetch('/api/tmux/send-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: sessionName, input: String(optionIndex + 1) }),
  });
  return res.ok;
};

const ApprovalQueueItem = (props: IApprovalQueueItemProps) => {
  const t = useTranslations('notification');
  const [phase, setPhase] = useState<TApprovalPhase>('loading');
  const [options, setOptions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setOptions([]);
    setSelectedIndex(null);
    setSent(false);

    if (!props.sessionName) {
      setPhase('failed');
      return;
    }

    fetchPermissionOptions(props.sessionName).then((nextOptions) => {
      if (cancelled) return;
      if (!hasUsableApprovalOptions(nextOptions)) {
        setPhase('failed');
        return;
      }
      setOptions(nextOptions);
      setPhase('ready');
    }).catch(() => {
      if (!cancelled) setPhase('failed');
    });

    return () => { cancelled = true; };
  }, [props.sessionName, props.lastEventSeq]);

  const handleSelect = useCallback(async (idx: number) => {
    if (!props.sessionName || selectedIndex !== null || sent) return;
    setSelectedIndex(idx);
    const ok = await sendSelection(props.sessionName, idx).catch(() => false);
    if (!ok) {
      setSelectedIndex(null);
      toast.error(t('approvalSendFailed'));
      return;
    }
    if (props.lastEventSeq !== undefined) {
      ackNotificationInput(props.tabId, props.lastEventSeq);
    }
    setSent(true);
  }, [props.sessionName, props.lastEventSeq, props.tabId, selectedIndex, sent, t]);

  const handleNavigate = useCallback(() => {
    props.onNavigate?.(props.workspaceId, props.tabId);
  }, [props]);

  return (
    <div className={cn('rounded-md border border-border/70 px-3 py-2.5', props.isActiveTab ? 'bg-agent-active/10' : 'bg-background')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{props.workspaceName}</p>
          <p className="truncate text-sm">{getApprovalQueueFallbackText({ lastUserMessage: props.lastUserMessage, tabName: props.tabName })}</p>
        </div>
        {sent && <Check className="h-4 w-4 shrink-0 text-agent-active" />}
      </div>

      {phase === 'loading' && (
        <div className="flex items-center gap-2 rounded border border-border/50 px-2.5 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('approvalLoading')}
        </div>
      )}

      {phase === 'failed' && (
        <div className="flex items-center justify-between gap-2 rounded border border-ui-amber/40 px-2.5 py-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-ui-amber" />
            <span className="truncate">{t('approvalFallback')}</span>
          </span>
          {!props.isActiveTab && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleNavigate}>
              {t('navigate')}
            </Button>
          )}
        </div>
      )}

      {phase === 'ready' && (
        <div className="flex flex-col gap-1.5">
          {options.map((option, idx) => {
            const selected = selectedIndex === idx;
            return (
              <button
                key={`${idx}-${option}`}
                type="button"
                disabled={selectedIndex !== null || sent}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex min-h-9 items-center gap-2 rounded border border-border/60 px-2.5 py-1.5 text-left text-sm transition-colors',
                  selected ? 'border-agent-active/50 bg-agent-active/10' : 'hover:border-agent-active/30 hover:bg-agent-active/5',
                  (selectedIndex !== null || sent) && !selected && 'opacity-50',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  {selected && !sent ? <Spinner size={10} /> : idx + 1}
                </span>
                <span className="min-w-0 truncate">{cleanApprovalOptionLabel(option)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalQueueItem;
```

- [ ] **Step 2: Add locale strings**

Add to `messages/ko/notification.json`:

```json
"approvalLoading": "승인 선택지 확인 중",
"approvalFallback": "선택지를 읽을 수 없습니다",
"approvalSendFailed": "선택 전달에 실패했습니다"
```

Add to `messages/en/notification.json`:

```json
"approvalLoading": "Loading approval options",
"approvalFallback": "Could not read approval options",
"approvalSendFailed": "Failed to send selection"
```

### Task 3: Wire The Global Notification Panel

**Files:**
- Modify: `src/components/features/workspace/notification-sheet.tsx`

- [ ] **Step 1: Import queue component and tab collector**

Add:

```typescript
import ApprovalQueueItem from '@/components/features/workspace/approval-queue-item';
import { collectAllTabs } from '@/lib/layout-tree';
```

- [ ] **Step 2: Include tab name and event seq in notification items**

Extend `INotificationItem`:

```typescript
tabName: string;
lastEventSeq?: number;
```

In `collectItems`, populate:

```typescript
tabName: tab.name,
lastEventSeq: tab.lastEvent?.seq,
```

- [ ] **Step 3: Build a local session lookup**

Inside `NotificationPanel`:

```typescript
const layout = useLayoutStore((s) => s.layout);
const tabSessionMap = useMemo(() => {
  const map = new Map<string, string>();
  if (!layout?.root) return map;
  for (const tab of collectAllTabs(layout.root)) {
    map.set(tab.id, tab.sessionName);
  }
  return map;
}, [layout]);
```

- [ ] **Step 4: Replace needs-input item rendering**

Replace the `needsInputItems.map` body with:

```tsx
{needsInputItems.map((item) => (
  <motion.div key={item.tabId} {...ITEM_MOTION}>
    <ApprovalQueueItem
      tabId={item.tabId}
      sessionName={tabSessionMap.get(item.tabId) ?? null}
      workspaceId={item.workspaceId}
      workspaceName={item.workspaceName}
      tabName={item.tabName}
      lastUserMessage={item.lastUserMessage}
      lastEventSeq={item.lastEventSeq}
      isActiveTab={item.tabId === activeTabId}
      onNavigate={handleNavigate}
    />
  </motion.div>
))}
```

### Task 4: Verification

**Files:**
- No source files beyond previous tasks.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/approval-queue.test.ts tests/unit/lib/permission-prompt.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run permission smoke**

Run:

```bash
corepack pnpm smoke:permission
```

Expected: smoke passes with `needs-input` transition, option parsing, stdin selection, and ack to `busy`.

- [ ] **Step 3: Run type/lint checks**

Run:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: both commands pass.

- [ ] **Step 4: Update docs**

Modify `docs/FOLLOW-UP.md` to mark approval queue 1차 구현 as in progress or done with verification commands. Add an operation handoff if smoke passes:

```text
docs/operations/2026-05-05-approval-queue-handoff.md
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/approval-queue.ts tests/unit/lib/approval-queue.test.ts src/components/features/workspace/approval-queue-item.tsx src/components/features/workspace/notification-sheet.tsx messages/ko/notification.json messages/en/notification.json docs/FOLLOW-UP.md docs/operations/2026-05-05-approval-queue-handoff.md
git commit -m "Add global approval queue"
```
