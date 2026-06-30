import { contextBridge, ipcRenderer } from "electron";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface DesktopConfig {
  appUrl: string;
  healthUrl: string;
}

contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("get-app-info"),

  getConfig: (): Promise<DesktopConfig> => ipcRenderer.invoke("get-config"),

  retryConnection: (): Promise<boolean> =>
    ipcRenderer.invoke("retry-connection"),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),
});
