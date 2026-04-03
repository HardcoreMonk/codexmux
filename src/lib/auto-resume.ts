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
      log.warn(`프로세스 확인 불가: ${target.tmuxSession}`);
      return false;
    }

    if (!SAFE_SHELLS.has(command)) {
      if (command === 'claude' || command === 'node') {
        log.info(`Claude 이미 실행 중, skip: ${target.tmuxSession}`);
        return true;
      }
      log.info(`셸이 아닌 프로세스 실행 중 (${command}), skip: ${target.tmuxSession}`);
      return false;
    }

    const settings = `--settings ${HOOK_SETTINGS_PATH}`;
    const resumeCmd = skipPerms
      ? `claude --resume ${target.claudeSessionId} ${settings} --dangerously-skip-permissions`
      : `claude --resume ${target.claudeSessionId} ${settings}`;
    log.info(`resume 전송: ${target.tmuxSession} → ${target.claudeSessionId}${skipPerms ? ' (skip-permissions)' : ''}`);
    await sendKeys(target.tmuxSession, resumeCmd);

    return true;
  } catch (err) {
    log.error(`실패: ${target.tmuxSession} — ${err instanceof Error ? err.message : err}`);
    return false;
  }
};

export const executeAutoResume = async (targets: IAutoResumeTarget[]): Promise<void> => {
  // Phase 1: 세션 생성 (순차 — 첫 createSession이 tmux 서버를 cold-start하므로 race 방지)
  let hasNewSession = false;
  for (const target of targets) {
    if (!(await hasSession(target.tmuxSession))) {
      log.info(`tmux 세션 없음, 새로 생성: ${target.tmuxSession}`);
      await createSession(target.tmuxSession, 80, 24);
      hasNewSession = true;
    }
  }

  // Phase 2: 새 세션이 있으면 셸 초기화 대기 (한 번만)
  if (hasNewSession) {
    await sleep(SHELL_READY_DELAY_MS);
  }

  // Phase 3: resume 명령 병렬 전송
  const skipPerms = await getDangerouslySkipPermissions();
  await Promise.allSettled(targets.map((target) => sendResumeKeys(target, skipPerms)));
};

export const autoResumeOnStartup = async (): Promise<void> => {
  const targets = await findAutoResumeTargets();
  if (targets.length === 0) return;

  log.info(`${targets.length}개 Surface 자동 resume 시작`);
  executeAutoResume(targets).then(() => {
    log.info('자동 resume 완료');
  }).catch((err) => {
    log.error(`자동 resume 중 오류: ${err instanceof Error ? err.message : err}`);
  });
};
