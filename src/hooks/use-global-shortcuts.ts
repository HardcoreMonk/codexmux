import { useHotkeys } from 'react-hotkeys-hook';
import { useRouter } from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useSelectWorkspace } from '@/hooks/use-sidebar-actions';
import { WORKSPACE_NUMBER_KEYS, KEY_MAP } from '@/lib/keyboard-shortcuts';

const HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true as const,
};

const useGlobalShortcuts = () => {
  const selectWorkspace = useSelectWorkspace();
  const router = useRouter();

  useHotkeys(
    WORKSPACE_NUMBER_KEYS,
    (event) => {
      const { workspaces } = useWorkspaceStore.getState();
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const workspace =
        digit === 9
          ? workspaces[workspaces.length - 1]
          : workspaces[digit - 1];
      if (workspace) {
        selectWorkspace(workspace.id);
      }
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.SETTINGS,
    () => {
      window.dispatchEvent(new Event('open-settings'));
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.NEW_WORKSPACE,
    async () => {
      const store = useWorkspaceStore.getState();
      const ws = await store.createWorkspace('');
      if (ws) selectWorkspace(ws.id);
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.RENAME_WORKSPACE,
    () => {
      const { activeWorkspaceId } = useWorkspaceStore.getState();
      if (!activeWorkspaceId) return;
      window.dispatchEvent(
        new CustomEvent('rename-workspace', { detail: activeWorkspaceId }),
      );
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.TOGGLE_SIDEBAR,
    () => {
      useWorkspaceStore.getState().toggleSidebar();
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.NOTES,
    () => {
      router.push('/reports');
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    KEY_MAP.STATS,
    () => {
      router.push('/stats');
    },
    HOTKEY_OPTIONS,
  );
};

export default useGlobalShortcuts;
