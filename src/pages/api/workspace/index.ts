import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getWorkspaces, createWorkspace } from '@/lib/workspace-store';
import { readLayoutFile, resolveLayoutFile, collectAllTabs } from '@/lib/layout-store';
import { buildResumeCommand } from '@/lib/claude-command';
import { sendKeys } from '@/lib/tmux';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('workspace-api');

const SHELL_READY_DELAY_MS = 500;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const data = await getWorkspaces();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { directory, name, resumeSessionId } = req.body ?? {};
    const resolvedDirectory =
      directory && typeof directory === 'string' ? directory : os.homedir();

    try {
      const layoutOptions = resumeSessionId ? { panelType: 'claude-code' as const } : undefined;
      const workspace = await createWorkspace(resolvedDirectory, name, layoutOptions);

      if (resumeSessionId) {
        const layout = await readLayoutFile(resolveLayoutFile(workspace.id));
        if (layout) {
          const tab = collectAllTabs(layout.root)[0];
          if (tab) {
            getStatusManager().registerTab(tab.id, {
              cliState: 'inactive',
              workspaceId: workspace.id,
              tabName: tab.name,
              tmuxSession: tab.sessionName,
            });
            setTimeout(async () => {
              try {
                const resumeCmd = await buildResumeCommand(resumeSessionId);
                await sendKeys(tab.sessionName, resumeCmd);
              } catch (err) {
                log.warn(`resume sendKeys failed: ${err instanceof Error ? err.message : err}`);
              }
            }, SHELL_READY_DELAY_MS);
          }
        }
      }

      return res.status(200).json(workspace);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const isValidation = ['not exist', 'directory', 'registered'].some((k) => message.includes(k));
      return res.status(isValidation ? 400 : 500).json({ error: message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
