import { create } from 'zustand';

export interface IConfigInitialData {
  appTheme?: string | null;
  terminalTheme?: { light: string; dark: string } | null;
  dangerouslySkipPermissions?: boolean;
  editorUrl?: string;
  hasAuthPassword?: boolean;
}

interface IConfigState {
  dangerouslySkipPermissions: boolean;
  editorUrl: string;
  hasAuthPassword: boolean;

  hydrate: (data: IConfigInitialData) => void;
  setDangerouslySkipPermissions: (enabled: boolean) => void;
  setEditorUrl: (url: string) => void;
  changePassword: (password: string) => void;
}

const saveConfig = (updates: Record<string, unknown>) => {
  fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }).catch((err) => {
    console.log(`[config-store] update failed: ${err instanceof Error ? err.message : err}`);
  });
};

const useConfigStore = create<IConfigState>((set, get) => ({
  dangerouslySkipPermissions: false,
  editorUrl: '',
  hasAuthPassword: false,

  hydrate: (data) => {
    set({
      dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? false,
      editorUrl: data.editorUrl ?? '',
      hasAuthPassword: data.hasAuthPassword ?? false,
    });
  },

  setDangerouslySkipPermissions: (enabled) => {
    set({ dangerouslySkipPermissions: enabled });
    saveConfig({ dangerouslySkipPermissions: enabled });
  },

  setEditorUrl: (url) => {
    if (get().editorUrl === url) return;
    set({ editorUrl: url });
    saveConfig({ editorUrl: url });
  },

  changePassword: (password) => {
    set({ hasAuthPassword: true });
    saveConfig({ authPassword: password });
  },
}));

export default useConfigStore;
