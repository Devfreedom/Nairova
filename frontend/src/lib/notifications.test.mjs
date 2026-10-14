// Tests for the notification-inbox helpers (destination allowlisting,
// page merging, read-state transitions, badge decrement). No DOM or
// dependencies: run with `npm run test:parser` (node --test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_DESTINATIONS,
  resolveNotificationDestination,
  mergeNotificationPages,
  applyMarkRead,
  applyMarkAllRead,
  decrementUnread,
} from "./notifications.js";

const ITEMS = [
  { id: 3, title: "Transfer received", read: false },
  { id: 2, title: "Deposit received", read: false },
  { id: 1, title: "Simulated credit received", read: true },
];

describe("notification destinations", () => {
  it("allowlist covers exactly the server-supported destinations", () => {
    assert.deepEqual(Object.keys(NOTIFICATION_DESTINATIONS).sort(), ["/", "/history", "/transfer"]);
  });

  it("resolves supported destinations to internal routes", () => {
    assert.deepEqual(resolveNotificationDestination("/history"), { to: "/history", label: "View in history" });
    assert.deepEqual(resolveNotificationDestination("/"), { to: "/", label: "View dashboard" });
    assert.deepEqual(resolveNotificationDestination("/transfer"), { to: "/transfer", label: "Go to transfer" });
  });

  it("never links anywhere else", () => {
    for (const dest of [null, undefined, "", "/admin", "/settings", "https://example.com", "//history", "/history/extra"]) {
      assert.equal(resolveNotificationDestination(dest), null);
    }
  });

  it("links purchases and transfers to history", () => {
    assert.equal(resolveNotificationDestination("/history").to, "/history");
  });
});

describe("notification pagination", () => {
  it("appends a fresh page after existing items", () => {
    const merged = mergeNotificationPages(ITEMS.slice(0, 2), [ITEMS[2]]);
    assert.deepEqual(merged.map((n) => n.id), [3, 2, 1]);
  });

  it("skips ids already loaded so a retried page cannot duplicate rows", () => {
    const merged = mergeNotificationPages(ITEMS.slice(0, 2), [ITEMS[1], ITEMS[2]]);
    assert.deepEqual(merged.map((n) => n.id), [3, 2, 1]);
  });

  it("handles empty pages on either side", () => {
    assert.deepEqual(mergeNotificationPages([], ITEMS).map((n) => n.id), [3, 2, 1]);
    assert.deepEqual(mergeNotificationPages(ITEMS, []), ITEMS);
  });
});

describe("notification read states", () => {
  it("marks one notification read and leaves the rest untouched", () => {
    const next = applyMarkRead(ITEMS, 3);
    assert.equal(next.find((n) => n.id === 3).read, true);
    assert.equal(next.find((n) => n.id === 2).read, false);
    assert.equal(next.find((n) => n.id === 1).read, true);
    // The original list is not mutated.
    assert.equal(ITEMS.find((n) => n.id === 3).read, false);
  });

  it("ignores unknown ids", () => {
    assert.deepEqual(applyMarkRead(ITEMS, 999), ITEMS);
  });

  it("marks every notification read", () => {
    const next = applyMarkAllRead(ITEMS);
    assert.ok(next.every((n) => n.read === true));
    assert.equal(ITEMS.filter((n) => !n.read).length, 2);
  });
});

describe("unread badge decrement", () => {
  it("decrements by one without going below zero", () => {
    assert.equal(decrementUnread(3), 2);
    assert.equal(decrementUnread(1), 0);
    assert.equal(decrementUnread(0), 0);
  });
});
