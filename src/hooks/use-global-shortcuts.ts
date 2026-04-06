import { useHotkeys } from 'react-hotkeys-hook';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useSelectWorkspace } from '@/hooks/use-sidebar-actions';
import { WORKSPACE_NUMBER_KEYS, KEY_MAP } from '@/lib/keyboard-shortcuts';

const HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true as const,
};

const useGlobalShortcuts = () => {
  const selectWorkspace = useSelectWorkspace();

  useHotkeys(
    WORKSPACE_NUMBER_KEYS,
    (event) => {
      const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
      const digit = parseInt(event.code.replace('Digit', ''), 10);
      if (isNaN(digit) || digit < 1 || digit > 9) return;

      const workspace =
        digit === 9
          ? workspaces[workspaces.length - 1]
          : workspaces[digit - 1];
      if (workspace && workspace.id !== activeWorkspaceId) {
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
};

export default useGlobalShortcuts;
