import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TOPUP_PENDING_KEY,
  loadTopupPending,
  saveTopupPending,
  clearTopupPending,
  maskMsisdn,
  buildTopupReceiptText,
  isUncertainOutcome,
  isPinlessError,
  mintKey,
} from "./topup.js";
import { parseAirtimeAmount, AIRTIME_MIN_AMOUNT, AIRTIME_MAX_AMOUNT } from "./amount.js";

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

const AIRTIME_INTENT = {
  key: "11111111-2222-4333-8444-555555555555",
  kind: "airtime",
  network: "MTN",
  msisdn: "+2348012345678",
  msisdnDisplay: "08012345678",
  amount: 500,
  amountDisplay: "500",
  bundle: null,
  narration: "lunch",
};

const DATA_INTENT = {
  key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  kind: "data",
  network: "Glo",
  msisdn: "+2349012345678",
  msisdnDisplay: "09012345678",
  amount: 2000,
  amountDisplay: "Glo 7GB Monthly",
  bundle: { code: "GLO-7GB-30D", name: "Glo 7GB Monthly", allowance: "7 GB", validity: "30 days" },
  narration: "",
};

describe("topup pending intents", () => {
  it("round-trips airtime and data intents", () => {
    const s = memStorage();
    saveTopupPending(AIRTIME_INTENT, s);
    assert.deepEqual(loadTopupPending(s), AIRTIME_INTENT);
    saveTopupPending(DATA_INTENT, s);
    assert.deepEqual(loadTopupPending(s), DATA_INTENT);
  });

  it("uses its own storage key, separate from transfers", () => {
    assert.equal(TOPUP_PENDING_KEY, "nairova.pendingTopup");
    assert.notEqual(TOPUP_PENDING_KEY, "nairova.pendingTransfer");
  });

  it("returns null for absent, corrupt, or misshapen data", () => {
    const s = memStorage();
    assert.equal(loadTopupPending(s), null);
    s.setItem(TOPUP_PENDING_KEY, "{nope");
    assert.equal(loadTopupPending(s), null);
    s.setItem(TOPUP_PENDING_KEY, JSON.stringify({ ...AIRTIME_INTENT, kind: "rocket" }));
    assert.equal(loadTopupPending(s), null);
    s.setItem(TOPUP_PENDING_KEY, JSON.stringify({ ...AIRTIME_INTENT, amount: "500" }));
    assert.equal(loadTopupPending(s), null);
    s.setItem(
      TOPUP_PENDING_KEY,
      JSON.stringify({ ...DATA_INTENT, bundle: { code: "X" } })
    );
    assert.equal(loadTopupPending(s), null);
  });

  it("never persists secrets", () => {
    const s = memStorage();
    saveTopupPending({ ...AIRTIME_INTENT, pin: "9999", password: "x", token: "y" }, s);
    const raw = s.getItem(TOPUP_PENDING_KEY);
    assert.ok(!raw.includes("9999"));
    assert.ok(!raw.includes("password"));
    assert.ok(!raw.includes("token"));
    const loaded = loadTopupPending(s);
    assert.ok(!("pin" in loaded));
  });

  it("clears and survives broken storage", () => {
    const s = memStorage();
    saveTopupPending(AIRTIME_INTENT, s);
    clearTopupPending(s);
    assert.equal(loadTopupPending(s), null);
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    assert.equal(loadTopupPending(broken), null);
    saveTopupPending(AIRTIME_INTENT, broken);
    clearTopupPending(broken);
  });

  it("classifies uncertain and pinless outcomes like transfers", () => {
    assert.equal(isUncertainOutcome({ isNetworkError: true }), true);
    assert.equal(isUncertainOutcome({ status: 502 }), true);
    assert.equal(isUncertainOutcome({ status: 400 }), false);
    assert.equal(isUncertainOutcome({ status: 409 }), false);
    assert.equal(isPinlessError({ message: "You must create a PIN before making purchases" }), true);
    assert.equal(isPinlessError({ message: "Incorrect PIN" }), false);
    assert.match(mintKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("topup amount bounds", () => {
  it("accepts the approved airtime range", () => {
    assert.equal(AIRTIME_MIN_AMOUNT, 100);
    assert.equal(AIRTIME_MAX_AMOUNT, 10000);
    for (const v of [100, 200, 5000, 10000, "1,000"]) {
      assert.equal(parseAirtimeAmount(v).ok, true);
    }
  });

  it("rejects out-of-range and malformed airtime amounts", () => {
    for (const v of [99, 10001, 0, -5, "abc", "", "10.999"]) {
      assert.equal(parseAirtimeAmount(v).ok, false);
    }
  });
});

describe("topup masking and receipts", () => {
  it("masks recipient numbers without leaking full digits", () => {
    const masked = maskMsisdn("08012345678");
    assert.ok(!masked.includes("08012345678"));
    assert.ok(masked.includes("678"));
    assert.equal(maskMsisdn("+2348012345678"), maskMsisdn("08012345678"));
  });

  it("builds airtime receipts from confirmed values with disclosure", () => {
    const text = buildTopupReceiptText({
      reference: "NVR-20260101-ABCDEF123456",
      timestamp: "2026-10-13T10:00:00.000Z",
      kind: "airtime",
      network: "MTN",
      msisdn: "+2348012345678",
      amount: 500,
      fee: 0,
      bundle: null,
      narration: "lunch",
      newBalance: 9500,
    });
    assert.ok(text.includes("NVR-20260101-ABCDEF123456"));
    assert.ok(text.includes("Status: Success"));
    assert.ok(text.includes("MTN"));
    assert.ok(text.includes("Narration: lunch"));
    assert.ok(text.includes("New balance:"));
    assert.ok(text.includes("No real airtime or data was delivered"));
    assert.ok(!text.includes("+2348012345678"), "full number masked");
    assert.ok(!text.includes("undefined"));
  });

  it("builds data receipts with bundle details", () => {
    const text = buildTopupReceiptText({
      reference: "NVR-20260101-123456ABCDEF",
      timestamp: "2026-10-13T10:00:00.000Z",
      kind: "data",
      network: "Glo",
      msisdn: "+2349012345678",
      amount: 2000,
      fee: 0,
      bundle: { code: "GLO-7GB-30D", name: "Glo 7GB Monthly", allowance: "7 GB", validity: "30 days" },
      narration: null,
      newBalance: 8000,
    });
    assert.ok(text.includes("data receipt"));
    assert.ok(text.includes("Glo 7GB Monthly (7 GB, 30 days)"));
    assert.ok(!text.includes("Narration:"));
  });
});
