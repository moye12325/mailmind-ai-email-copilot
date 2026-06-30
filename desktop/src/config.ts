import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface DesktopSettings {
  appUrl: string;
  healthUrl: string;
}

const ENV_APP_URL = "MAILMIND_DESKTOP_APP_URL";
const ENV_HEALTH_URL = "MAILMIND_DESKTOP_API_HEALTH_URL";

const DEFAULT_APP_URL = "http://127.0.0.1:3000";
const DEFAULT_HEALTH_URL = "http://127.0.0.1:8000/health";

/**
 * Load desktop configuration with priority:
 * 1. Environment variables
 * 2. userData/config.json
 * 3. Built-in defaults
 */
export function loadConfig(): DesktopSettings {
  let fileConfig: Partial<DesktopSettings> = {};

  try {
    const configPath = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    }
  } catch {
    // Ignore config file errors; fall through to defaults
  }

  return {
    appUrl:
      process.env[ENV_APP_URL] ??
      fileConfig.appUrl ??
      DEFAULT_APP_URL,
    healthUrl:
      process.env[ENV_HEALTH_URL] ??
      fileConfig.healthUrl ??
      DEFAULT_HEALTH_URL,
  };
}
