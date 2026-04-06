import { readLayoutFile, resolveLayoutFile, collectAllTabs } from '@/lib/layout-store';
import { hasSession, createSession, getPaneCurrentCommand, sendKeys } from '@/lib/tmux';
import { getWorkspaces } from '@/lib/workspace-store';
import { getDangerouslySkipPermissions } from '@/lib/config-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';
import { createLogger } from '@/lib/logger';

const log = createLogger('auto-resume');

const SHELL_READY_DELAY_MS = 500;
const SAFE_SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash']);

interface IAutoResumeTarget {
  workspaceId: string;
  tabId: string;
  tmuxSession: string;
  claudeSessionId: string;
}

const findAutoResumeTargets = async (): Promise<IAutoResumeTarget[]> => {
  const { workspaces } = await getWorkspaces();
  const targets: IAutoResumeTarget[] = [];

  for (const ws of workspaces) {
    const layout = await readLayoutFile(resolveLayoutFile(ws.id));
    if (!layout) continue;

    const tabs = collectAllTabs(layout.root);
    for (const tab of tabs) {
      if (tab.panelType === 'claude-code' && tab.claudeSessionId) {
        targets.push({
          workspaceId: ws.id,
          tabId: tab.id,
          tmuxSession: tab.sessionName,
          claudeSessionId: tab.claudeSessionId,
        });
      }
    }
  }

  return targets;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const sendResumeKeys = async (target: IAutoResumeTarget, skipPerms: boolean): Promise<boolean> => {
  try {
    const command = await getPaneCurrentCommand(target.tmuxSession);
    if (!command) {
      log.warn(`Cannot check process: ${target.tmuxSession}`);
      return false;
    }

    if (!SAFE_SHELLS.has(command)) {
      if (command === 'claude' || command === 'node') {
        log.debug(`Claude already running, skip: ${target.tmuxSession}`);
        return true;
      }
      log.debug(`Non-shell process running (${command}), skip: ${target.tmuxSession}`);
      return false;
    }

    const settings = `--settings ${HOOK_SETTINGS_PATH}`;
    const resumeCmd = skipPerms
      ? `claude --resume ${target.claudeSessionId} ${settings} --dangerously-skip-permissions`
      : `claude --resume ${target.claudeSessionId} ${settings}`;
    log.info(`Sending resume: ${target.tmuxSession} → ${target.claudeSessionId}${skipPerms ? ' (skip-permissions)' : ''}`);
    await sendKeys(target.tmuxSession, resumeCmd);

    return true;
  } catch (err) {
    log.error(`Failed: ${target.tmuxSession} — ${err instanceof Error ? err.message : err}`);
    return false;
  }
};

export const executeAutoResume = async (targets: IAutoResumeTarget[]): Promise<void> => {
  // Phase 1: Sequential session creation — first createSession cold-starts tmux server, so avoid race
  let hasNewSession = false;
  for (const target of targets) {
    if (!(await hasSession(target.tmuxSession))) {
      log.info(`No tmux session, creating new: ${target.tmuxSession}`);
      await createSession(target.tmuxSession, 80, 24);
      hasNewSession = true;
    }
  }

  // Phase 2: Wait for shell initialization if new sessions were created (once)
  if (hasNewSession) {
    await sleep(SHELL_READY_DELAY_MS);
  }

  // Phase 3: Send resume commands in parallel
  const skipPerms = await getDangerouslySkipPermissions();
  await Promise.allSettled(targets.map((target) => sendResumeKeys(target, skipPerms)));
};

export const autoResumeOnStartup = async (): Promise<void> => {
  const targets = await findAutoResumeTargets();
  if (targets.length === 0) return;

  log.info(`${targets.length} surface(s) auto-resume started`);
  executeAutoResume(targets).then(() => {
    log.debug('Auto-resume complete');
  }).catch((err) => {
    log.error(`Auto-resume error: ${err instanceof Error ? err.message : err}`);
  });
};
