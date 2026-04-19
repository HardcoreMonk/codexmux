import { useHotkeys } from 'react-hotkeys-hook';
import { useResolvedKey } from '@/hooks/use-keybindings-store';
import type { TActionId } from '@/lib/keyboard-shortcuts';

const useBoundHotkey = (
  id: TActionId,
  handler: (event: KeyboardEvent) => void,
  enabled: boolean,
) => {
  const key = useResolvedKey(id);
  useHotkeys(key ?? '', handler, {
    preventDefault: true,
    enableOnFormTags: true,
    enabled: enabled && !!key,
  });
};

export default useBoundHotkey;
