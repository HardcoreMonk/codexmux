import { create } from 'zustand';

export type TNetworkAccess = 'localhost' | 'tailscale' | 'all';

export interface IConfigInitialData {
  appTheme?: string | null;
  terminalTheme?: { light: string; dark: string } | null;
  customCSS?: string;
  dangerouslySkipPermissions?: boolean;
  editorUrl?: string;
  notificationsEnabled?: boolean;
  hasAuthPassword?: boolean;
  locale?: string;
  fontSize?: string;
  systemResourcesEnabled?: boolean;
  networkAccess?: TNetworkAccess;
  hostEnvLocked?: boolean;
}

interface IConfigState {
  dangerouslySkipPermissions: boolean;
  editorUrl: string;
  notificationsEnabled: boolean;
  hasAuthPassword: boolean;
  locale: string;
  customCSS: string;
  fontSize: string;
  systemResourcesEnabled: boolean;
  networkAccess: TNetworkAccess;
  hostEnvLocked: boolean;

  hydrate: (data: IConfigInitialData) => void;
  setDangerouslySkipPermissions: (enabled: boolean) => void;
  setEditorUrl: (url: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  changePassword: (password: string) => void;
  setLocale: (locale: string) => void;
  setCustomCSS: (css: string) => void;
  setFontSize: (fontSize: string) => void;
  setSystemResourcesEnabled: (enabled: boolean) => void;
  setNetworkAccess: (value: TNetworkAccess) => void;
}

const initialConfig = { notificationsEnabled: true, editorUrl: '', dangerouslySkipPermissions: false, hasAuthPassword: false, locale: 'en', customCSS: '', fontSize: 'normal', systemResourcesEnabled: false, networkAccess: 'all' as TNetworkAccess, hostEnvLocked: false };

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
  notificationsEnabled: initialConfig.notificationsEnabled,
  hasAuthPassword: initialConfig.hasAuthPassword,
  locale: initialConfig.locale,
  customCSS: initialConfig.customCSS,
  fontSize: initialConfig.fontSize,
  systemResourcesEnabled: initialConfig.systemResourcesEnabled,
  networkAccess: initialConfig.networkAccess,
  hostEnvLocked: initialConfig.hostEnvLocked,

  hydrate: (data) => {
    set({
      dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? false,
      editorUrl: data.editorUrl ?? '',
      notificationsEnabled: data.notificationsEnabled ?? true,
      hasAuthPassword: data.hasAuthPassword ?? false,
      locale: data.locale ?? 'en',
      customCSS: data.customCSS ?? '',
      fontSize: data.fontSize ?? 'normal',
      systemResourcesEnabled: data.systemResourcesEnabled ?? false,
      networkAccess: data.networkAccess ?? 'all',
      hostEnvLocked: data.hostEnvLocked ?? false,
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
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).electronAPI) {
      (window as unknown as { electronAPI: { setLocale: (l: string) => void } }).electronAPI.setLocale(locale);
    }
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

  setNetworkAccess: (value) => {
    set({ networkAccess: value });
    saveConfig({ networkAccess: value });
  },
}));

export default useConfigStore;
