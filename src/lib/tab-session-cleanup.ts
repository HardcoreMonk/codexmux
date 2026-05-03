import { resolveTabRuntimeVersion } from '@/lib/runtime/terminal-mode';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';
import { killSession } from '@/lib/tmux';
import type { ITab } from '@/types/terminal';

type TCleanupTab = Pick<ITab, 'id' | 'sessionName' | 'panelType' | 'runtimeVersion'>;

export const cleanupTabSession = async (tab: TCleanupTab): Promise<void> => {
  if (tab.panelType === 'web-browser') return;
  if (resolveTabRuntimeVersion(tab) === 2) {
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    await supervisor.deleteTerminalTab(tab.id);
    return;
  }
  await killSession(tab.sessionName);
};
