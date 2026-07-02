import type { DesktopSettings } from "./config";

export interface DesktopConnectionSnapshot {
  healthy: boolean | null;
  checkedAt: string | null;
  source: "startup" | "retry" | "poll";
  detail: string;
}

export interface DesktopDiagnosticsSnapshot {
  app: {
    name: string;
    version: string;
    platform: string;
  };
  endpoints: {
    appUrl: string;
    healthUrl: string;
  };
  behavior: {
    minimizeToTray: boolean;
    showWindowOnStartup: boolean;
    notificationsEnabled: boolean;
  };
  connection: DesktopConnectionSnapshot;
  logDirectory: string;
}

export interface BuildDesktopDiagnosticsInput {
  appName: string;
  appVersion: string;
  platform: string;
  config: DesktopSettings;
  latestConnection: DesktopConnectionSnapshot;
  logDirectory: string;
}

export function buildDesktopDiagnostics(
  input: BuildDesktopDiagnosticsInput,
): DesktopDiagnosticsSnapshot {
  return {
    app: {
      name: input.appName,
      version: input.appVersion,
      platform: input.platform,
    },
    endpoints: {
      appUrl: input.config.appUrl,
      healthUrl: input.config.healthUrl,
    },
    behavior: {
      minimizeToTray: input.config.minimizeToTray,
      showWindowOnStartup: input.config.showWindowOnStartup,
      notificationsEnabled: input.config.notificationsEnabled,
    },
    connection: input.latestConnection,
    logDirectory: input.logDirectory,
  };
}

export function formatDesktopDiagnosticsText(
  snapshot: DesktopDiagnosticsSnapshot,
): string {
  return [
    "MailMind Desktop Diagnostics",
    `name: ${snapshot.app.name}`,
    `version: ${snapshot.app.version}`,
    `platform: ${snapshot.app.platform}`,
    `appUrl: ${snapshot.endpoints.appUrl}`,
    `healthUrl: ${snapshot.endpoints.healthUrl}`,
    `minimizeToTray: ${String(snapshot.behavior.minimizeToTray)}`,
    `showWindowOnStartup: ${String(snapshot.behavior.showWindowOnStartup)}`,
    `notificationsEnabled: ${String(snapshot.behavior.notificationsEnabled)}`,
    `healthy: ${String(snapshot.connection.healthy)}`,
    `checkedAt: ${snapshot.connection.checkedAt ?? "never"}`,
    `source: ${snapshot.connection.source}`,
    `detail: ${snapshot.connection.detail}`,
    `logDirectory: ${snapshot.logDirectory}`,
  ].join("\n");
}
