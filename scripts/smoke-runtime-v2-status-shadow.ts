#!/usr/bin/env tsx
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  shouldProcessHookEvent,
  shouldSendNeedsInputNotification,
  shouldSendReviewNotification,
} from '@/lib/status-notification-policy';
import { reduceCodexState, reduceHookState } from '@/lib/status-state-machine';
import { compareRuntimeStatusShadowDecision } from '@/lib/runtime/status-shadow-compare';
import { createRuntimeSupervisorForTest } from '@/lib/runtime/supervisor';

const main = async (): Promise<void> => {
  const homeDir = process.env.CODEXMUX_RUNTIME_V2_STATUS_SHADOW_HOME
    || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-v2-status-shadow-'));
  const dbPath = path.join(homeDir, 'runtime-v2', 'state.db');
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  const supervisor = createRuntimeSupervisorForTest({ dbPath, runtimeReset: true });
  const checks: string[] = [];

  try {
    await supervisor.ensureStarted();
    checks.push('workers-started');

    const hookInput = {
      currentState: 'busy' as const,
      eventName: 'stop' as const,
      providerId: 'codex',
    };
    const expectedHook = reduceHookState(hookInput);
    const actualHook = await supervisor.reduceStatusHookState(hookInput);
    const hookCompare = compareRuntimeStatusShadowDecision('hook-state', expectedHook, actualHook);
    if (!hookCompare.ok) {
      throw new Error(`runtime v2 status hook mismatch: ${JSON.stringify(hookCompare.mismatches)}`);
    }
    checks.push('hook-state-shadow');

    const codexInput = {
      currentState: 'busy' as const,
      running: true,
      hasJsonlPath: true,
      idle: true,
      hasCompletionSnippet: true,
    };
    const expectedCodex = reduceCodexState(codexInput);
    const actualCodex = await supervisor.reduceStatusCodexState(codexInput);
    const codexCompare = compareRuntimeStatusShadowDecision('codex-state', expectedCodex, actualCodex);
    if (!codexCompare.ok) {
      throw new Error(`runtime v2 status codex mismatch: ${JSON.stringify(codexCompare.mismatches)}`);
    }
    checks.push('codex-state-shadow');

    const policyInput = {
      eventName: 'notification' as const,
      notificationType: 'permission_prompt',
      newState: 'needs-input',
      silent: false,
    };
    const expectedPolicy = {
      processHookEvent: shouldProcessHookEvent(policyInput.eventName, policyInput.notificationType),
      sendReviewNotification: shouldSendReviewNotification(policyInput.newState, policyInput.silent),
      sendNeedsInputNotification: shouldSendNeedsInputNotification(policyInput.newState, policyInput.silent),
    };
    const actualPolicy = await supervisor.evaluateStatusNotificationPolicy(policyInput);
    const policyCompare = compareRuntimeStatusShadowDecision('notification-policy', expectedPolicy, actualPolicy);
    if (!policyCompare.ok) {
      throw new Error(`runtime v2 status policy mismatch: ${JSON.stringify(policyCompare.mismatches)}`);
    }
    checks.push('notification-policy-shadow');

    console.log(JSON.stringify({
      ok: true,
      homeDir,
      checks,
    }, null, 2));
  } finally {
    supervisor.shutdown();
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
