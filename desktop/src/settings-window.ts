import { BrowserWindow, shell } from "electron";

export interface OpenDesktopSettingsWindowOptions {
  appUrl: string;
  fallbackFilePath: string;
  preloadPath: string;
}

let settingsWindow: BrowserWindow | null = null;

function buildSettingsUrl(appUrl: string): string {
  const resolved = new URL(appUrl);
  resolved.pathname = "/settings/desktop";
  resolved.search = "";
  resolved.hash = "";
  return resolved.toString();
}

export async function openDesktopSettingsWindow(
  options: OpenDesktopSettingsWindowOptions,
): Promise<BrowserWindow> {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: "MailMind Desktop Settings",
    show: false,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
  });

  const allowedOrigin = new URL(options.appUrl).origin;
  let fallbackLoaded = false;

  const loadFallback = async (): Promise<void> => {
    if (settingsWindow === null || settingsWindow.isDestroyed() || fallbackLoaded) {
      return;
    }

    fallbackLoaded = true;
    await settingsWindow.loadFile(options.fallbackFilePath);
  };

  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:") || url.startsWith("mailto:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  settingsWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) {
      return;
    }

    const parsed = new URL(url);
    if (parsed.origin !== allowedOrigin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  settingsWindow.webContents.on("did-fail-load", () => {
    void loadFallback();
  });

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  try {
    await settingsWindow.loadURL(buildSettingsUrl(options.appUrl));
  } catch {
    await loadFallback();
  }

  return settingsWindow;
}
