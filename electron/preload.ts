import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getSystemResources: () => ipcRenderer.invoke('get-system-resources'),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', title, body),
  setDockBadge: (count: number) => ipcRenderer.invoke('set-dock-badge', count),
  onNotificationClick: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('notification-click', handler);
    return () => { ipcRenderer.removeListener('notification-click', handler); };
  },
});
