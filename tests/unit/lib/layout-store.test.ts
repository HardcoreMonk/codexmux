import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readLayoutFile } from '@/lib/layout-store';

describe('layout store normalization', () => {
  it('normalizes stored panel and agent fields on read', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-layout-'));
    const filePath = path.join(dir, 'layout.json');
    await fs.writeFile(filePath, JSON.stringify({
      root: {
        type: 'pane',
        id: 'pane-test',
        activeTabId: 'tab-agent',
        tabs: [
          {
            id: 'tab-agent',
            sessionName: 'pt-ws-pane-tab',
            name: 'codex',
            order: 0,
            panelType: 'codex',
            agentSessionId: 'agent-session',
            agentJsonlPath: '/agent.jsonl',
            agentSummary: 'agent summary',
          },
          {
            id: 'tab-terminal',
            sessionName: 'pt-ws-pane-terminal',
            name: 'terminal',
            order: 1,
          },
        ],
      },
      activePaneId: 'pane-test',
      updatedAt: new Date(0).toISOString(),
    }));

    const layout = await readLayoutFile(filePath);
    const agentTab = layout?.root.type === 'pane' ? layout.root.tabs[0] : null;
    const terminalTab = layout?.root.type === 'pane' ? layout.root.tabs[1] : null;

    expect(agentTab).toMatchObject({
      panelType: 'codex',
      agentSessionId: 'agent-session',
      agentJsonlPath: '/agent.jsonl',
      agentSummary: 'agent summary',
    });
    expect(terminalTab).not.toHaveProperty('agentSessionId');
  });
});
