import { readLayoutFile, resolveLayoutFile, collectAllTabs } from '@/lib/layout-store';
import { hasSession, createSession, getPaneCurrentCommand, sendKeys } from '@/lib/tmux';
import { getWorkspaces, getDangerouslySkipPermissions } from '@/lib/workspace-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';

const RESUME_INTERVAL_MS = 2_000;
const SHELL_READY_DELAY_MS = 1_000;
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

const resumeSingleSurface = async (target: IAutoResumeTarget): Promise<boolean> => {
  try {
    const sessionExists = await hasSession(target.tmuxSession);

    if (!sessionExists) {
      console.log(`[auto-resume] tmux 세션 없음, 새로 생성: ${target.tmuxSession}`);
      await createSession(target.tmuxSession, 80, 24);
    }

    const command = await getPaneCurrentCommand(target.tmuxSession);
    if (!command) {
      console.log(`[auto-resume] 프로세스 확인 불가: ${target.tmuxSession}`);
      return false;
    }

    if (!SAFE_SHELLS.has(command)) {
      if (command === 'claude' || command === 'node') {
        console.log(`[auto-resume] Claude 이미 실행 중, skip: ${target.tmuxSession}`);
        return true;
      }
      console.log(`[auto-resume] 셸이 아닌 프로세스 실행 중 (${command}), skip: ${target.tmuxSession}`);
      return false;
    }

    await sleep(SHELL_READY_DELAY_MS);

    const skipPerms = await getDangerouslySkipPermissions();
    const settings = `--settings ${HOOK_SETTINGS_PATH}`;
    const resumeCmd = skipPerms
      ? `claude --resume ${target.claudeSessionId} ${settings} --dangerously-skip-permissions`
      : `claude --resume ${target.claudeSessionId} ${settings}`;
    console.log(`[auto-resume] resume 전송: ${target.tmuxSession} → ${target.claudeSessionId}${skipPerms ? ' (skip-permissions)' : ''}`);
    await sendKeys(target.tmuxSession, resumeCmd);

    return true;
  } catch (err) {
    console.log(`[auto-resume] 실패: ${target.tmuxSession} — ${err instanceof Error ? err.message : err}`);
    return false;
  }
};

export const executeAutoResume = async (targets: IAutoResumeTarget[]): Promise<void> => {
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    await resumeSingleSurface(target);

    if (i < targets.length - 1) {
      await sleep(RESUME_INTERVAL_MS);
    }
  }
};

export const autoResumeOnStartup = async (): Promise<void> => {
  const targets = await findAutoResumeTargets();
  if (targets.length === 0) return;

  console.log(`[auto-resume] ${targets.length}개 Surface 자동 resume 시작`);
  executeAutoResume(targets).then(() => {
    console.log(`[auto-resume] 자동 resume 완료`);
  }).catch((err) => {
    console.log(`[auto-resume] 자동 resume 중 오류: ${err instanceof Error ? err.message : err}`);
  });
};
