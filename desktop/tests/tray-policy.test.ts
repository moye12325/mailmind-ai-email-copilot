import test from "node:test";
import assert from "node:assert/strict";

import { shouldHideToTray, shouldShowTrayHint } from "../src/tray-policy";

test("shouldHideToTray is enabled for close on windows", () => {
  assert.equal(shouldHideToTray("win32", false), true);
});

test("shouldHideToTray is enabled for close on linux", () => {
  assert.equal(shouldHideToTray("linux", false), true);
});

test("shouldHideToTray is disabled on darwin", () => {
  assert.equal(shouldHideToTray("darwin", false), false);
});

test("shouldHideToTray is disabled when force quit is active", () => {
  assert.equal(shouldHideToTray("win32", true), false);
});

test("shouldShowTrayHint only shows once", () => {
  assert.equal(shouldShowTrayHint(false), true);
  assert.equal(shouldShowTrayHint(true), false);
});
