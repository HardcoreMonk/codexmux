import { create } from 'zustand';
import { collectPanes, useLayoutStore } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';

interface ITabMetadata {
  title?: string;
  cwd?: string;
  lastCommand?: string | null;
}

interface ITabMetadataState {
  metadata: Record<string, ITabMetadata>;
  setTitle: (tabId: string, title: string) => void;
  setCwd: (tabId: string, cwd: string) => void;
  setLastCommand: (tabId: string, lastCommand: string | null) => void;
  removeTab: (tabId: string) => void;
  hydrate: (data: Record<string, ITabMetadata>) => void;
  retainOnly: (tabIds: Set<string>) => void;
  reset: () => void;
}

const SYNC_DEBOUNCE_MS = 100;

let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _prevCwdsKey = '';

const scheduleSyncToLayout = () => {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    const { metadata } = useTabMetadataStore.getState();
    const layout = useLayoutStore.getState().layout;
    const wsId = useLayoutStore.getState().workspaceId;
    if (!layout || !wsId) return;

    const wsParam = `?workspace=${wsId}`;
    for (const pane of collectPanes(layout.root)) {
      for (const tab of pane.tabs) {
        const meta = metadata[tab.id];
        if (!meta) continue;
        const patch: Record<string, string | null | undefined> = {};
        if (meta.title !== undefined && meta.title !== tab.title) patch.title = meta.title;
        if (meta.cwd !== undefined && meta.cwd !== tab.cwd) patch.cwd = meta.cwd;
        if (meta.lastCommand !== undefined && (meta.lastCommand ?? null) !== (tab.lastCommand ?? null)) patch.lastCommand = meta.lastCommand ?? null;
        if (Object.keys(patch).length > 0) {
          fetch(`/api/layout/pane/${pane.id}/tabs/${tab.id}${wsParam}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          }).catch((err) => {
            console.log(`[tab-metadata] sync failed: ${err instanceof Error ? err.message : err}`);
          });
        }
      }
    }

    const cwds = [...new Set(
      Object.values(metadata)
        .map((m) => m.cwd)
        .filter((c): c is string => !!c),
    )];
    const key = cwds.join('\0');
    if (key !== _prevCwdsKey) {
      _prevCwdsKey = key;
      const { activeWorkspaceId, updateDirectories } = useWorkspaceStore.getState();
      if (activeWorkspaceId && cwds.length > 0) {
        updateDirectories(activeWorkspaceId, cwds);
      }
    }
  }, SYNC_DEBOUNCE_MS);
};

const useTabMetadataStore = create<ITabMetadataState>((set) => ({
  metadata: {},

  setTitle: (tabId, title) => {
    set((state) => {
      const prev = state.metadata[tabId];
      if (prev?.title === title) return state;
      return { metadata: { ...state.metadata, [tabId]: { ...prev, title } } };
    });
    scheduleSyncToLayout();
  },

  setCwd: (tabId, cwd) => {
    set((state) => {
      const prev = state.metadata[tabId];
      if (prev?.cwd === cwd) return state;
      return { metadata: { ...state.metadata, [tabId]: { ...prev, cwd } } };
    });
    scheduleSyncToLayout();
  },

  setLastCommand: (tabId, lastCommand) => {
    set((state) => {
      const prev = state.metadata[tabId];
      if (prev?.lastCommand === lastCommand) return state;
      return { metadata: { ...state.metadata, [tabId]: { ...prev, lastCommand } } };
    });
    scheduleSyncToLayout();
  },

  removeTab: (tabId) => {
    set((state) => {
      const { [tabId]: _removed, ...rest } = state.metadata;  
      return { metadata: rest };
    });
    scheduleSyncToLayout();
  },

  hydrate: (data) => {
    set((state) => {
      const merged: Record<string, ITabMetadata> = {};
      for (const [id, incoming] of Object.entries(data)) {
        const existing = state.metadata[id];
        if (existing) {
          merged[id] = {
            ...incoming,
            ...(existing.cwd ? { cwd: existing.cwd } : {}),
          };
        } else {
          merged[id] = incoming;
        }
      }
      return { metadata: merged };
    });
    _prevCwdsKey = '';
  },

  retainOnly: (tabIds) => {
    set((state) => {
      const next: Record<string, ITabMetadata> = {};
      for (const id of tabIds) {
        if (state.metadata[id]) next[id] = state.metadata[id];
      }
      return { metadata: next };
    });
  },

  reset: () => {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = null;
    _prevCwdsKey = '';
    set({ metadata: {} });
  },
}));

export type { ITabMetadata };
export default useTabMetadataStore;
