import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { addExistingTabToPane, addTabToPane, updateTabAgentSessionId } from '@/lib/layout-store';
import { getActiveWorkspaceId, getWorkspaceById } from '@/lib/workspace-store';
import { getStatusManager } from '@/lib/status-manager';
import { getProviderByPanelType } from '@/lib/providers';
import { sendKeys } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import { shouldCreateTerminalTabInRuntimeV2 } from '@/lib/runtime/terminal-mode';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const log = createLogger('layout');

const SHELL_READY_DELAY_MS = 500;

const isPlainTerminalTabRequest = (input: {
  panelType?: unknown;
  command?: unknown;
  resumeSessionId?: unknown;
}): boolean => {
  if (input.command || input.resumeSessionId) return false;
  return input.panelType === undefined || input.panelType === null || input.panelType === '' || input.panelType === 'terminal';
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'No workspace found' });
  }

  const paneId = req.query.paneId as string;
  const { name, cwd, panelType, command, resumeSessionId } = req.body ?? {};

  const provider = resumeSessionId ? getProviderByPanelType(panelType ?? 'codex') : null;
  if (resumeSessionId) {
    if (!provider) {
      return res.status(400).json({ error: 'Unknown panel type for resume' });
    }
    if (!provider.isValidSessionId(resumeSessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
  }

  try {
    const shouldUseRuntimeV2 = shouldCreateTerminalTabInRuntimeV2() && isPlainTerminalTabRequest({
      panelType,
      command,
      resumeSessionId,
    });
    const workspace = shouldUseRuntimeV2 ? await getWorkspaceById(wsId) : null;
    const effectiveCwd = typeof cwd === 'string' && cwd.trim()
      ? cwd.trim()
      : workspace?.directories[0] ?? os.homedir();
    const tab = shouldUseRuntimeV2
      ? await (async () => {
          const supervisor = getRuntimeSupervisor();
          await supervisor.ensureStarted();
          const runtimeTab = await supervisor.createTerminalTab({
            workspaceId: wsId,
            paneId,
            cwd: effectiveCwd,
            ensureWorkspacePane: {
              workspaceName: workspace?.name ?? wsId,
              defaultCwd: workspace?.directories[0] ?? effectiveCwd,
            },
          });
          const added = await addExistingTabToPane(wsId, paneId, {
            id: runtimeTab.id,
            sessionName: runtimeTab.sessionName,
            name: typeof name === 'string' ? name.trim() : runtimeTab.name,
            order: runtimeTab.order,
            cwd: runtimeTab.cwd ?? effectiveCwd,
            panelType: 'terminal',
            runtimeVersion: 2,
          });
          if (!added) {
            await Promise.resolve(supervisor.deleteTerminalTab(runtimeTab.id)).catch((err) => {
              log.warn(`runtime v2 tab rollback failed: ${err instanceof Error ? err.message : err}`);
            });
          }
          return added;
        })()
      : await addTabToPane(wsId, paneId, name, cwd, panelType, command);
    if (!tab) {
      return res.status(404).json({ error: 'Pane not found' });
    }
    if (tab.panelType !== 'web-browser') {
      getStatusManager().registerTab(tab.id, {
        cliState: 'inactive',
        workspaceId: wsId,
        tabName: tab.name,
        tmuxSession: tab.sessionName,
        lastEvent: null,
        eventSeq: 0,
      });
    }

    if (resumeSessionId && provider && !command) {
      await updateTabAgentSessionId(tab.sessionName, provider, resumeSessionId);
      provider.writeSessionId(tab, resumeSessionId);
      setTimeout(async () => {
        try {
          const resumeCmd = await provider.buildResumeCommand(resumeSessionId, { workspaceId: wsId });
          await sendKeys(tab.sessionName, resumeCmd);
        } catch (err) {
          log.warn(`resume sendKeys failed: ${err instanceof Error ? err.message : err}`);
        }
      }, SHELL_READY_DELAY_MS);
    }

    return res.status(200).json(tab);
  } catch (err) {
    log.error(`tab creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create tab' });
  }
};

export default handler;
