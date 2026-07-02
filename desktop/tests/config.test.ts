import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DEFAULT_DESKTOP_SETTINGS,
  loadDesktopConfig,
  saveDesktopConfig,
  validateDesktopConfig,
} from "../src/config";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mailmind-config-"));
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

test("loadDesktopConfig returns defaults when config file is missing", () => {
  const userDataPath = createTempDir();

  try {
    const config = loadDesktopConfig(userDataPath, {});
    assert.deepEqual(config, DEFAULT_DESKTOP_SETTINGS);
  } finally {
    cleanupTempDir(userDataPath);
  }
});

test("loadDesktopConfig lets environment override file endpoints", () => {
  const userDataPath = createTempDir();

  try {
    saveDesktopConfig(userDataPath, {
      appUrl: "http://127.0.0.1:3100",
      healthUrl: "http://127.0.0.1:8100/health",
      minimizeToTray: false,
      showWindowOnStartup: false,
      notificationsEnabled: false,
    });

    const config = loadDesktopConfig(userDataPath, {
      MAILMIND_DESKTOP_APP_URL: "http://127.0.0.1:3200",
      MAILMIND_DESKTOP_API_HEALTH_URL: "http://127.0.0.1:8200/health",
    });

    assert.equal(config.appUrl, "http://127.0.0.1:3200");
    assert.equal(config.healthUrl, "http://127.0.0.1:8200/health");
    assert.equal(config.minimizeToTray, false);
    assert.equal(config.showWindowOnStartup, false);
    assert.equal(config.notificationsEnabled, false);
  } finally {
    cleanupTempDir(userDataPath);
  }
});

test("saveDesktopConfig persists canonical settings", () => {
  const userDataPath = createTempDir();

  try {
    const saved = saveDesktopConfig(userDataPath, {
      appUrl: "http://127.0.0.1:3300",
      healthUrl: "http://127.0.0.1:8300/health",
      minimizeToTray: false,
      showWindowOnStartup: false,
      notificationsEnabled: false,
    });

    assert.deepEqual(saved, {
      appUrl: "http://127.0.0.1:3300",
      healthUrl: "http://127.0.0.1:8300/health",
      minimizeToTray: false,
      showWindowOnStartup: false,
      notificationsEnabled: false,
    });

    const reloaded = loadDesktopConfig(userDataPath, {});
    assert.deepEqual(reloaded, saved);
  } finally {
    cleanupTempDir(userDataPath);
  }
});

test("validateDesktopConfig rejects unsupported URLs", () => {
  assert.throws(
    () =>
      validateDesktopConfig({
        ...DEFAULT_DESKTOP_SETTINGS,
        appUrl: "file:///tmp/index.html",
      }),
    /appUrl/i,
  );
});
