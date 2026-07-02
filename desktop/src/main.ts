import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from "electron";
import * as path from "path";
import { type DesktopSettings, loadConfig, saveDesktopConfig } from "./config";
import {
  buildDesktopDiagnostics,
  formatDesktopDiagnosticsText,
  type DesktopConnectionSnapshot,
} from "./diagnostics";
import { createDesktopLogger, type DesktopLogger } from "./logger";
import { getConnectionNotification, getConnectionTransition } from "./connection-state";
import { openDesktopSettingsWindow } from "./settings-window";
import { shouldHideToTray, shouldShowTrayHint } from "./tray-policy";
import { loadWindowState, saveWindowState, type WindowBounds } from "./window-state";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let forceQuit = false;
let hasShownTrayHint = false;
let connectionHealthy: boolean | null = null;
let desktopConfig: DesktopSettings;
let logger: DesktopLogger;

const APP_VERSION = app.getVersion();
const APP_NAME = app.getName();
const TRAY_TOOLTIP = "MailMind";
const HEALTH_TIMEOUT_MS = 5000;

let latestConnection: DesktopConnectionSnapshot = {
  healthy: null,
  checkedAt: null,
  source: "startup",
  detail: "Health check has not run yet.",
};

interface HealthCheckResult {
  healthy: boolean;
  detail: string;
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getFallbackPath(): string {
  return path.join(__dirname, "fallback.html");
}

async function checkHealth(healthUrl: string, timeoutMs: number): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    return {
      healthy: response.ok,
      detail: response.ok
        ? `Health endpoint responded ${response.status}.`
        : `Health endpoint returned ${response.status}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        healthy: false,
        detail: `Health check timed out after ${timeoutMs}ms.`,
      };
    }

    return {
      healthy: false,
      detail: error instanceof Error ? error.message : "Health check failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function setLatestConnection(
  source: DesktopConnectionSnapshot["source"],
  result: HealthCheckResult,
): void {
  latestConnection = {
    healthy: result.healthy,
    checkedAt: new Date().toISOString(),
    source,
    detail: result.detail,
  };

  logger.info("Connection check completed", {
    source,
    healthy: result.healthy,
    detail: result.detail,
  });
}

function createWebPreferences(): Electron.BrowserWindowConstructorOptions["webPreferences"] {
  return {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    sandbox: true,
  };
}

function installExternalNavigationGuards(window: BrowserWindow, appUrl: string): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:") || url.startsWith("mailto:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) {
      return;
    }

    const parsed = new URL(url);
    const allowed = new URL(appUrl);
    if (parsed.origin !== allowed.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function createWindow(): void {
  const userDataPath = app.getPath("userData");
  const persistedState = loadWindowState(userDataPath);

  mainWindow = new BrowserWindow({
    width: persistedState.width,
    height: persistedState.height,
    x: persistedState.x,
    y: persistedState.y,
    minWidth: 900,
    minHeight: 600,
    title: "MailMind",
    show: false,
    webPreferences: createWebPreferences(),
  });

  installExternalNavigationGuards(mainWindow, desktopConfig.appUrl);

  mainWindow.once("ready-to-show", () => {
    if (persistedState.isMaximized) {
      mainWindow?.maximize();
    }

    if (desktopConfig.showWindowOnStartup) {
      mainWindow?.show();
    }
  });

  mainWindow.on("resize", () => {
    persistWindowState();
  });

  mainWindow.on("move", () => {
    persistWindowState();
  });

  mainWindow.on("maximize", () => {
    persistWindowState();
  });

  mainWindow.on("unmaximize", () => {
    persistWindowState();
  });

  mainWindow.on("close", (event) => {
    if (
      !desktopConfig.minimizeToTray ||
      !shouldHideToTray(process.platform, forceQuit)
    ) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
    showTrayHint();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void loadApp("startup");
}

async function loadApp(
  source: DesktopConnectionSnapshot["source"],
): Promise<boolean> {
  if (!mainWindow) {
    return false;
  }

  const healthResult = await checkHealth(desktopConfig.healthUrl, HEALTH_TIMEOUT_MS);

  if (healthResult.healthy) {
    try {
      await mainWindow.loadURL(desktopConfig.appUrl);
      setLatestConnection(source, healthResult);
      notifyConnectionTransition(true);
      return true;
    } catch (error) {
      const failedResult: HealthCheckResult = {
        healthy: false,
        detail:
          error instanceof Error
            ? `Web app failed to load: ${error.message}`
            : "Web app failed to load.",
      };
      setLatestConnection(source, failedResult);
      notifyConnectionTransition(false);
      logger.warn("Web app load failed", {
        appUrl: desktopConfig.appUrl,
        detail: failedResult.detail,
      });
      await mainWindow.loadFile(getFallbackPath());
      return false;
    }
  }

  setLatestConnection(source, healthResult);
  notifyConnectionTransition(false);
  await mainWindow.loadFile(getFallbackPath());
  return false;
}

function buildDiagnosticsSnapshot() {
  return buildDesktopDiagnostics({
    appName: APP_NAME,
    appVersion: APP_VERSION,
    platform: process.platform,
    config: desktopConfig,
    latestConnection,
    logDirectory: logger.logDirectory,
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("get-app-info", () => ({
    name: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
  }));

  ipcMain.handle("desktop:get-config", () => desktopConfig);

  ipcMain.handle("desktop:save-config", (_event, input: DesktopSettings) => {
    const saved = saveDesktopConfig(app.getPath("userData"), input);
    desktopConfig = {
      ...desktopConfig,
      ...saved,
    };
    buildMenu();
    buildTray();
    logger.info("Desktop config updated", {
      appUrl: saved.appUrl,
      healthUrl: saved.healthUrl,
      minimizeToTray: saved.minimizeToTray,
      showWindowOnStartup: saved.showWindowOnStartup,
      notificationsEnabled: saved.notificationsEnabled,
    });
    return desktopConfig;
  });

  ipcMain.handle("desktop:get-diagnostics", () => buildDiagnosticsSnapshot());

  ipcMain.handle("retry-connection", async () => {
    const healthy = await loadApp("retry");
    return healthy;
  });

  ipcMain.handle("open-external", (_event, url: string) => {
    if (url.startsWith("https:") || url.startsWith("http:") || url.startsWith("mailto:")) {
      return shell.openExternal(url);
    }

    throw new Error("Only http, https, and mailto links are allowed.");
  });

  ipcMain.handle("desktop:open-settings-window", async () => {
    await openDesktopSettingsWindow({
      appUrl: desktopConfig.appUrl,
      fallbackFilePath: getFallbackPath(),
      preloadPath: getPreloadPath(),
    });
  });

  ipcMain.handle("desktop:open-logs", async () => {
    const result = await shell.openPath(logger.logDirectory);
    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle("desktop:copy-diagnostics", async () => {
    const text = formatDesktopDiagnosticsText(buildDiagnosticsSnapshot());
    clipboard.writeText(text);
    return text;
  });
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Show MailMind",
          click: () => showMainWindow(),
        },
        {
          label: "Hide MailMind",
          click: () => mainWindow?.hide(),
        },
        { type: "separator" },
        {
          label: "Desktop Settings",
          click: () => {
            void openDesktopSettingsWindow({
              appUrl: desktopConfig.appUrl,
              fallbackFilePath: getFallbackPath(),
              preloadPath: getPreloadPath(),
            });
          },
        },
        {
          label: "Open Logs",
          click: () => {
            void shell.openPath(logger.logDirectory);
          },
        },
        { type: "separator" },
        {
          label: "Open Web App",
          click: () => shell.openExternal(desktopConfig.appUrl),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        {
          label: "Hide to Tray",
          click: () => mainWindow?.hide(),
        },
        { role: "close" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "MailMind Documentation",
          click: () => shell.openExternal("https://github.com/Vibe-Coding-X/mailmind-ai-email-copilot"),
        },
        {
          label: "Report Issue",
          click: () =>
            shell.openExternal(
              "https://github.com/Vibe-Coding-X/mailmind-ai-email-copilot/issues",
            ),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTray(): void {
  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);

  if (tray === null) {
    tray = new Tray(icon);
    tray.setToolTip(TRAY_TOOLTIP);
    tray.on("click", () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    });
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show MailMind",
        click: () => showMainWindow(),
      },
      {
        label: "Desktop Settings",
        click: () => {
          void openDesktopSettingsWindow({
            appUrl: desktopConfig.appUrl,
            fallbackFilePath: getFallbackPath(),
            preloadPath: getPreloadPath(),
          });
        },
      },
      {
        label: "Open Logs",
        click: () => {
          void shell.openPath(logger.logDirectory);
        },
      },
      {
        label: "Open Web App",
        click: () => shell.openExternal(desktopConfig.appUrl),
      },
      {
        label: "Quit",
        click: () => {
          forceQuit = true;
          app.quit();
        },
      },
    ]),
  );
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function persistWindowState(): void {
  if (!mainWindow) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const state: WindowBounds = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: mainWindow.isMaximized(),
  };

  saveWindowState(app.getPath("userData"), state);
}

function showNotification(title: string, body: string): void {
  if (!desktopConfig.notificationsEnabled || !Notification.isSupported()) {
    return;
  }

  new Notification({ title, body }).show();
}

function showTrayHint(): void {
  if (!shouldShowTrayHint(hasShownTrayHint)) {
    return;
  }

  hasShownTrayHint = true;
  showNotification("MailMind is still running", "The app was hidden to the system tray.");
}

function notifyConnectionTransition(healthy: boolean): void {
  const transition = getConnectionTransition(connectionHealthy, healthy);
  connectionHealthy = healthy;
  const notification = getConnectionNotification(transition);
  if (notification) {
    showNotification(notification.title, notification.body);
  }
}

app.whenReady().then(() => {
  desktopConfig = loadConfig();
  logger = createDesktopLogger(app.getPath("userData"));
  logger.info("Desktop app starting", {
    version: APP_VERSION,
    platform: process.platform,
  });

  buildMenu();
  registerIpcHandlers();
  buildTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (forceQuit && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  forceQuit = true;
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});
