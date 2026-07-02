import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSettings } from "./config";
import type { DesktopDiagnosticsSnapshot } from "./diagnostics";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface ElectronDesktopAPI {
  getAppInfo(): Promise<AppInfo>;
  getDesktopConfig(): Promise<DesktopSettings>;
  saveDesktopConfig(input: DesktopSettings): Promise<DesktopSettings>;
  getDesktopDiagnostics(): Promise<DesktopDiagnosticsSnapshot>;
  retryConnection(): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  openDesktopSettings(): Promise<void>;
  openDesktopLogs(): Promise<void>;
  copyDesktopDiagnostics(): Promise<string>;
}

const electronAPI: ElectronDesktopAPI & {
  getConfig(): Promise<DesktopSettings>;
} = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("get-app-info"),

  getDesktopConfig: (): Promise<DesktopSettings> =>
    ipcRenderer.invoke("desktop:get-config"),

  saveDesktopConfig: (input: DesktopSettings): Promise<DesktopSettings> =>
    ipcRenderer.invoke("desktop:save-config", input),

  getDesktopDiagnostics: (): Promise<DesktopDiagnosticsSnapshot> =>
    ipcRenderer.invoke("desktop:get-diagnostics"),

  retryConnection: (): Promise<boolean> => ipcRenderer.invoke("retry-connection"),

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open-external", url),

  openDesktopSettings: (): Promise<void> =>
    ipcRenderer.invoke("desktop:open-settings-window"),

  openDesktopLogs: (): Promise<void> => ipcRenderer.invoke("desktop:open-logs"),

  copyDesktopDiagnostics: (): Promise<string> =>
    ipcRenderer.invoke("desktop:copy-diagnostics"),

  getConfig(): Promise<DesktopSettings> {
    return ipcRenderer.invoke("desktop:get-config");
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
