import { create } from 'zustand';

export interface IConfigInitialData {
  appTheme?: string | null;
  terminalTheme?: { light: string; dark: string } | null;
  customCSS?: string;
  dangerouslySkipPermissions?: boolean;
  editorUrl?: string;
  agentEnabled?: boolean;
  notificationsEnabled?: boolean;
  hasAuthPassword?: boolean;
  locale?: string;
  fontSize?: string;
  systemResourcesEnabled?: boolean;
}

interface IConfigState {
  dangerouslySkipPermissions: boolean;
  editorUrl: string;
  agentEnabled: boolean;
  notificationsEnabled: boolean;
  hasAuthPassword: boolean;
  locale: string;
  customCSS: string;
  fontSize: string;
  systemResourcesEnabled: boolean;

  hydrate: (data: IConfigInitialData) => void;
  setDangerouslySkipPermissions: (enabled: boolean) => void;
  setEditorUrl: (url: string) => void;
  setAgentEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  changePassword: (password: string) => void;
  setLocale: (locale: string) => void;
  setCustomCSS: (css: string) => void;
  setFontSize: (fontSize: string) => void;
  setSystemResourcesEnabled: (enabled: boolean) => void;
}

const initialConfig = { agentEnabled: false, notificationsEnabled: true, editorUrl: '', dangerouslySkipPermissions: false, hasAuthPassword: false, locale: 'en', customCSS: '', fontSize: 'normal', systemResourcesEnabled: false };

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
  dangerouslySkipPermissions: initialConfig.dangerouslySkipPermissions,
  editorUrl: initialConfig.editorUrl,
  agentEnabled: initialConfig.agentEnabled,
  notificationsEnabled: initialConfig.notificationsEnabled,
  hasAuthPassword: initialConfig.hasAuthPassword,
  locale: initialConfig.locale,
  customCSS: initialConfig.customCSS,
  fontSize: initialConfig.fontSize,
  systemResourcesEnabled: initialConfig.systemResourcesEnabled,

  hydrate: (data) => {
    set({
      dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? false,
      editorUrl: data.editorUrl ?? '',
      agentEnabled: data.agentEnabled ?? false,
      notificationsEnabled: data.notificationsEnabled ?? true,
      hasAuthPassword: data.hasAuthPassword ?? false,
      locale: data.locale ?? 'en',
      customCSS: data.customCSS ?? '',
      fontSize: data.fontSize ?? 'normal',
      systemResourcesEnabled: data.systemResourcesEnabled ?? false,
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

  setAgentEnabled: (enabled) => {
    set({ agentEnabled: enabled });
    saveConfig({ agentEnabled: enabled });
  },

  setNotificationsEnabled: (enabled) => {
    set({ notificationsEnabled: enabled });
    saveConfig({ notificationsEnabled: enabled });
  },

  changePassword: (password) => {
    set({ hasAuthPassword: true });
    saveConfig({ authPassword: password });
  },

  setLocale: (locale) => {
    set({ locale });
    saveConfig({ locale });
  },

  setCustomCSS: (css) => {
    set({ customCSS: css });
    saveConfig({ customCSS: css });
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
    saveConfig({ fontSize });
  },

  setSystemResourcesEnabled: (enabled) => {
    set({ systemResourcesEnabled: enabled });
    saveConfig({ systemResourcesEnabled: enabled });
  },
}));

export default useConfigStore;
