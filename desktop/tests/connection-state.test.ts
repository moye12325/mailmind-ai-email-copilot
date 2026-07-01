import test from "node:test";
import assert from "node:assert/strict";

import {
  type ConnectionTransition,
  getConnectionTransition,
  getConnectionNotification,
} from "../src/connection-state";

test("getConnectionTransition returns recovered when backend becomes reachable", () => {
  const transition = getConnectionTransition(false, true);
  assert.equal(transition, "recovered");
});

test("getConnectionTransition does not notify on first failed startup check", () => {
  const transition = getConnectionTransition(null, false);
  assert.equal(transition, "none");
});

test("getConnectionTransition returns lost when backend becomes unreachable", () => {
  const transition: ConnectionTransition = getConnectionTransition(true, false);
  assert.equal(transition, "lost");
});

test("getConnectionNotification returns copy for recovered services", () => {
  const notification = getConnectionNotification("recovered");
  assert.deepEqual(notification, {
    title: "MailMind connected",
    body: "Local services are reachable again.",
  });
});

test("getConnectionNotification returns null when no notification is needed", () => {
  const notification = getConnectionNotification("none");
  assert.equal(notification, null);
});
