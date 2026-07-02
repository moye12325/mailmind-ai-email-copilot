import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_DESKTOP_SETTINGS } from "../src/config";
import {
  buildDesktopDiagnostics,
  formatDesktopDiagnosticsText,
  type DesktopDiagnosticsSnapshot,
} from "../src/diagnostics";

function createSnapshot(): DesktopDiagnosticsSnapshot {
  return buildDesktopDiagnostics({
    appName: "MailMind",
    appVersion: "0.7.3",
    platform: "win32",
    config: {
      ...DEFAULT_DESKTOP_SETTINGS,
      minimizeToTray: false,
    },
    latestConnection: {
      healthy: false,
      checkedAt: "2026-07-02T02:00:00.000Z",
      source: "retry",
      detail: "Health endpoint returned 503.",
    },
    logDirectory: "C:/MailMind/logs",
  });
}

test("buildDesktopDiagnostics returns the current desktop snapshot", () => {
  const snapshot = createSnapshot();

  assert.equal(snapshot.app.name, "MailMind");
  assert.equal(snapshot.app.version, "0.7.3");
  assert.equal(snapshot.app.platform, "win32");
  assert.equal(snapshot.endpoints.appUrl, DEFAULT_DESKTOP_SETTINGS.appUrl);
  assert.equal(snapshot.behavior.minimizeToTray, false);
  assert.equal(snapshot.connection.healthy, false);
  assert.equal(snapshot.connection.source, "retry");
  assert.equal(snapshot.connection.detail, "Health endpoint returned 503.");
  assert.equal(snapshot.logDirectory, "C:/MailMind/logs");
});

test("formatDesktopDiagnosticsText produces copyable support text", () => {
  const text = formatDesktopDiagnosticsText(createSnapshot());

  assert.match(text, /MailMind/);
  assert.match(text, /version: 0\.7\.3/);
  assert.match(text, /appUrl: http:\/\/127\.0\.0\.1:3000/);
  assert.match(text, /healthy: false/);
  assert.match(text, /logDirectory: C:\/MailMind\/logs/);
});
