import * as fs from "fs";
import * as path from "path";

export interface DesktopLogger {
  readonly logDirectory: string;
  readonly logFilePath: string;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function formatLogLine(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  meta?: Record<string, unknown>,
): string {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${new Date().toISOString()}] ${level} ${message}${suffix}\n`;
}

function appendLogLine(
  logFilePath: string,
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  meta?: Record<string, unknown>,
): void {
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, formatLogLine(level, message, meta), "utf-8");
  } catch {
    // Logging must never crash the desktop shell.
  }
}

export function createDesktopLogger(userDataPath: string): DesktopLogger {
  const logDirectory = path.join(userDataPath, "logs");
  const logFilePath = path.join(logDirectory, "desktop.log");

  return {
    logDirectory,
    logFilePath,
    info(message, meta) {
      appendLogLine(logFilePath, "INFO", message, meta);
    },
    warn(message, meta) {
      appendLogLine(logFilePath, "WARN", message, meta);
    },
    error(message, meta) {
      appendLogLine(logFilePath, "ERROR", message, meta);
    },
  };
}
