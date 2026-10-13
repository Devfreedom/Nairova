// Tests for the transfer-flow helpers (pending recovery, outcome
// classification, receipt text). No DOM or dependencies: run with
// `npm run test:parser` (node --test) using an in-memory storage stub.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_KEY,
  mintKey,
  loadPending,
  savePending,
  clearPending,
  isUncertainOutcome,
  isPinlessError,
  lagosTime,
  buildReceiptText,
} from "./transfer.js";

function stubStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(k),
    raw: (k) => store.get(k),
  };
}

function failingStorage() {
  return {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
}

const INTENT = {
  key: "11111111-2222-4333-8555-666666666666",
  receiverAccountNumber: "1234567890",
  receiverName: "Adaeze Obi",
  amount: 1500,
  amountDisplay: "1,500",
  narration: "Lunch refund",
};

describe("pending transfer recovery", () => {
  it("round-trips an intent through storage", () => {
    const storage = stubStorage();
    savePending(INTENT, storage);
    assert.deepEqual(loadPending(storage), INTENT);
  });

  it("returns null for absent, corrupt, or misshapen data", () => {
    assert.equal(loadPending(stubStorage()), null);
    assert.equal(loadPending(stubStorage({ [PENDING_KEY]: "not-json{" })), null);
    assert.equal(loadPending(stubStorage({ [PENDING_KEY]: JSON.stringify({ key: "x" }) })), null);
    assert.equal(
      loadPending(stubStorage({ [PENDING_KEY]: JSON.stringify({ ...INTENT, amount: "1500" }) })),
      null
    );
    assert.equal(
      loadPending(stubStorage({ [PENDING_KEY]: JSON.stringify({ ...INTENT, amount: NaN }) })),
      null
    );
  });

  it("defaults optional fields instead of rejecting the intent", () => {
    const storage = stubStorage();
    const { narration, amountDisplay, ...required } = INTENT;
    void narration;
    void amountDisplay;
    savePending(required, storage);
    assert.deepEqual(loadPending(storage), { ...required, amountDisplay: "1500", narration: "" });
  });

  it("never persists secrets, even if passed in", () => {
    const storage = stubStorage();
    // NOTE: the probe PIN must not collide with fixture digits.
    savePending({ ...INTENT, pin: "9999", password: "Secret1!", token: "jwt-value" }, storage);
    const raw = storage.raw(PENDING_KEY);
    assert.ok(!raw.includes("9999"), "PIN must not appear in storage");
    assert.ok(!raw.includes("Secret1!"), "password must not appear in storage");
    assert.ok(!raw.includes("jwt-value"), "token must not appear in storage");
    assert.deepEqual(loadPending(storage), INTENT);
  });

  it("clears the stored intent", () => {
    const storage = stubStorage();
    savePending(INTENT, storage);
    clearPending(storage);
    assert.equal(loadPending(storage), null);
  });

  it("survives unavailable storage without throwing", () => {
    const failing = failingStorage();
    assert.doesNotThrow(() => savePending(INTENT, failing));
    assert.doesNotThrow(() => clearPending(failing));
    assert.equal(loadPending(failing), null);
  });
});

describe("outcome classification", () => {
  it("treats network failures, timeouts, and 5xx as uncertain", () => {
    const network = new Error("Cannot reach the API");
    network.isNetworkError = true;
    network.status = null;
    assert.equal(isUncertainOutcome(network), true);
    const timeout = new Error("timed out");
    timeout.isNetworkError = true;
    timeout.status = null;
    assert.equal(isUncertainOutcome(timeout), true);
    for (const status of [500, 502, 503]) {
      const err = new Error(`Request failed (${status})`);
      err.status = status;
      err.isNetworkError = false;
      assert.equal(isUncertainOutcome(err), true, `${status} must be uncertain`);
    }
    assert.equal(isUncertainOutcome(new Error("boom")), true);
    assert.equal(isUncertainOutcome(null), true);
    assert.equal(isUncertainOutcome(undefined), true);
  });

  it("treats 4xx rejections as definitive", () => {
    // 429 is decided by the rate limiter before handlers run: nothing executed.
    for (const status of [400, 401, 403, 404, 409, 429]) {
      const err = new Error(`Request failed (${status})`);
      err.status = status;
      err.isNetworkError = false;
      assert.equal(isUncertainOutcome(err), false, `${status} must be definitive`);
    }
  });

  it("detects PIN-less accounts without matching other errors", () => {
    assert.equal(isPinlessError(new Error("You must create a PIN before making transfers")), true);
    assert.equal(isPinlessError(new Error("Incorrect PIN")), false);
    assert.equal(isPinlessError(new Error("Insufficient balance")), false);
    assert.equal(isPinlessError(null), false);
  });
});

describe("keys", () => {
  it("mints unique, well-formed keys — one per intended transfer", () => {
    const seen = new Set();
    for (let i = 0; i < 50; i += 1) {
      const key = mintKey();
      assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.ok(!seen.has(key), "keys must be unique");
      seen.add(key);
    }
  });
});

describe("receipt text", () => {
  it("renders confirmed values with a Lagos timestamp", () => {
    const text = buildReceiptText({
      reference: "NVR-20261013-A1B2C3D4E5F6",
      timestamp: "2026-10-13T10:00:00.000Z",
      fromName: "Chidi Eze",
      fromAccount: "1111111111",
      toName: "Adaeze Obi",
      toAccount: "1234567890",
      amount: 1500,
      fee: 0,
      narration: "Lunch refund",
    });
    assert.ok(text.includes("NVR-20261013-A1B2C3D4E5F6"));
    assert.ok(text.includes("Adaeze Obi (1234567890)"));
    assert.ok(text.includes("Chidi Eze (1111111111)"));
    assert.ok(text.includes("Lunch refund"));
    assert.ok(text.includes("Status: Success"));
    assert.ok(text.includes("(Africa/Lagos)"));
    assert.ok(text.includes("Simulated transfer"));
    assert.ok(!text.includes("undefined") && !text.includes("null"));
  });

  it("degrades gracefully when optional fields are absent", () => {
    const text = buildReceiptText({
      reference: "NVR-20261013-000000000000",
      timestamp: null,
      fromName: null,
      fromAccount: null,
      toName: "Adaeze Obi",
      toAccount: "1234567890",
      amount: 100,
      fee: undefined,
      narration: null,
    });
    assert.ok(text.includes("Your Nairova account"));
    assert.ok(!text.includes("undefined") && !text.includes("null"));
    assert.ok(!text.includes("Date:"));
    assert.ok(!text.includes("Narration:"));
  });

  it("formats Lagos time deterministically", () => {
    const rendered = lagosTime("2026-10-13T10:00:00.000Z");
    assert.ok(rendered.includes("2026"), "must contain the year");
    assert.ok(rendered.includes("Oct"), "must contain the month");
    assert.equal(lagosTime("not-a-date"), "");
  });
});
