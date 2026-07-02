import * as fs from "fs";
import * as path from "path";

export interface DesktopSettings {
  appUrl: string;
  healthUrl: string;
  minimizeToTray: boolean;
  showWindowOnStartup: boolean;
  notificationsEnabled: boolean;
}

export const ENV_APP_URL = "MAILMIND_DESKTOP_APP_URL";
export const ENV_HEALTH_URL = "MAILMIND_DESKTOP_API_HEALTH_URL";

const DEFAULT_APP_URL = "http://127.0.0.1:3000";
const DEFAULT_HEALTH_URL = "http://127.0.0.1:8000/health";

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  appUrl: DEFAULT_APP_URL,
  healthUrl: DEFAULT_HEALTH_URL,
  minimizeToTray: true,
  showWindowOnStartup: true,
  notificationsEnabled: true,
};

function getConfigPath(userDataPath: string): string {
  return path.join(userDataPath, "config.json");
}

function ensureHttpUrl(value: unknown, fieldName: "appUrl" | "healthUrl"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty URL.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use http or https.`);
  }

  if (parsed.pathname === "/" && parsed.search.length === 0 && parsed.hash.length === 0) {
    return parsed.origin;
  }

  return parsed.toString();
}

function ensureBoolean(value: unknown, fieldName: keyof Pick<
  DesktopSettings,
  "minimizeToTray" | "showWindowOnStartup" | "notificationsEnabled"
>): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

function parseFileConfig(userDataPath: string): Partial<DesktopSettings> {
  try {
    const configPath = getConfigPath(userDataPath);
    if (!fs.existsSync(configPath)) {
      return {};
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function resolveOptionalHttpUrl(
  value: unknown,
  fallback: string,
  fieldName: "appUrl" | "healthUrl",
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  try {
    return ensureHttpUrl(value, fieldName);
  } catch {
    return fallback;
  }
}

function resolveOptionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function applyEnvironmentOverrides(
  config: DesktopSettings,
  env: NodeJS.ProcessEnv,
): DesktopSettings {
  const next = { ...config };

  if (typeof env[ENV_APP_URL] === "string" && env[ENV_APP_URL]?.trim()) {
    next.appUrl = ensureHttpUrl(env[ENV_APP_URL], "appUrl");
  }

  if (typeof env[ENV_HEALTH_URL] === "string" && env[ENV_HEALTH_URL]?.trim()) {
    next.healthUrl = ensureHttpUrl(env[ENV_HEALTH_URL], "healthUrl");
  }

  return next;
}

export function validateDesktopConfig(input: Partial<DesktopSettings>): DesktopSettings {
  return {
    appUrl: ensureHttpUrl(input.appUrl, "appUrl"),
    healthUrl: ensureHttpUrl(input.healthUrl, "healthUrl"),
    minimizeToTray: ensureBoolean(input.minimizeToTray, "minimizeToTray"),
    showWindowOnStartup: ensureBoolean(input.showWindowOnStartup, "showWindowOnStartup"),
    notificationsEnabled: ensureBoolean(input.notificationsEnabled, "notificationsEnabled"),
  };
}

export function loadDesktopConfig(
  userDataPath: string,
  env: NodeJS.ProcessEnv,
): DesktopSettings {
  const fileConfig = parseFileConfig(userDataPath);
  const resolved: DesktopSettings = {
    appUrl: resolveOptionalHttpUrl(
      fileConfig.appUrl,
      DEFAULT_DESKTOP_SETTINGS.appUrl,
      "appUrl",
    ),
    healthUrl: resolveOptionalHttpUrl(
      fileConfig.healthUrl,
      DEFAULT_DESKTOP_SETTINGS.healthUrl,
      "healthUrl",
    ),
    minimizeToTray: resolveOptionalBoolean(
      fileConfig.minimizeToTray,
      DEFAULT_DESKTOP_SETTINGS.minimizeToTray,
    ),
    showWindowOnStartup: resolveOptionalBoolean(
      fileConfig.showWindowOnStartup,
      DEFAULT_DESKTOP_SETTINGS.showWindowOnStartup,
    ),
    notificationsEnabled: resolveOptionalBoolean(
      fileConfig.notificationsEnabled,
      DEFAULT_DESKTOP_SETTINGS.notificationsEnabled,
    ),
  };

  return applyEnvironmentOverrides(resolved, env);
}

export function saveDesktopConfig(
  userDataPath: string,
  input: Partial<DesktopSettings>,
): DesktopSettings {
  const resolved = validateDesktopConfig(input);
  const configPath = getConfigPath(userDataPath);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(resolved, null, 2)}\n`, "utf-8");
  return resolved;
}

/**
 * Load effective desktop configuration with priority:
 * 1. Environment variables
 * 2. userData/config.json
 * 3. Built-in defaults
 */
export function loadConfig(): DesktopSettings {
  // Delay Electron access so pure Node tests can import this module.
  const { app } = require("electron") as typeof import("electron");
  return loadDesktopConfig(app.getPath("userData"), process.env);
}
