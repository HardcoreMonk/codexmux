export interface IAndroidAppInfo {
  versionName: string;
  versionCode: string;
  packageName: string;
  deviceModel: string;
  androidVersion: string;
}

interface IAndroidBridge {
  getVersionName?: () => string;
  getVersionCode?: () => string;
  getPackageName?: () => string;
  getDeviceModel?: () => string;
  getAndroidVersion?: () => string;
  restartApp?: () => void;
}

type TAndroidInfoGetter =
  | 'getVersionName'
  | 'getVersionCode'
  | 'getPackageName'
  | 'getDeviceModel'
  | 'getAndroidVersion';

declare global {
  interface Window {
    CodexmuxAndroid?: IAndroidBridge;
  }
}

const readValue = (bridge: IAndroidBridge, getterName: TAndroidInfoGetter): string => {
  try {
    const getter = bridge[getterName];
    if (typeof getter !== 'function') return '-';
    const value = getter.call(bridge).trim();
    return value || '-';
  } catch {
    return '-';
  }
};

export const getAndroidBridge = (): IAndroidBridge | null => {
  if (typeof window === 'undefined') return null;
  return window.CodexmuxAndroid ?? null;
};

export const readAndroidAppInfo = (): IAndroidAppInfo | null => {
  const bridge = getAndroidBridge();
  if (!bridge) return null;

  return {
    versionName: readValue(bridge, 'getVersionName'),
    versionCode: readValue(bridge, 'getVersionCode'),
    packageName: readValue(bridge, 'getPackageName'),
    deviceModel: readValue(bridge, 'getDeviceModel'),
    androidVersion: readValue(bridge, 'getAndroidVersion'),
  };
};

export const canRestartAndroidApp = (): boolean =>
  !!getAndroidBridge()?.restartApp;

export const restartAndroidApp = (): boolean => {
  const bridge = getAndroidBridge();
  const restartApp = bridge?.restartApp;
  if (!restartApp) return false;

  try {
    restartApp.call(bridge);
    return true;
  } catch {
    return false;
  }
};
