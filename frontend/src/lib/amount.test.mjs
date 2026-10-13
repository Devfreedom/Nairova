// Focused tests for the admin amount parser. No extra dependencies:
// run with `npm run test:parser` (node --test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, parseTransferAmount } from "./amount.js";

describe("parseAmount", () => {
  it("accepts plain integers", () => {
    assert.deepEqual(parseAmount("100000"), { ok: true, value: 100000 });
  });

  it("accepts correctly grouped thousands", () => {
    assert.deepEqual(parseAmount("100,000"), { ok: true, value: 100000 });
    assert.deepEqual(parseAmount("1,000,000"), { ok: true, value: 1000000 });
  });

  it("accepts valid decimals up to two places", () => {
    assert.deepEqual(parseAmount("100,000.50"), { ok: true, value: 100000.5 });
    assert.deepEqual(parseAmount("100000.5"), { ok: true, value: 100000.5 });
    assert.deepEqual(parseAmount("0.50"), { ok: true, value: 0.5 });
  });

  it("trims surrounding whitespace", () => {
    assert.deepEqual(parseAmount("  100,000  "), { ok: true, value: 100000 });
  });

  it("rejects malformed comma grouping", () => {
    for (const bad of ["10,00", "1,,000", "100,0.50", "1000,00", ",100", "100,"]) {
      const res = parseAmount(bad);
      assert.equal(res.ok, false, `${bad} should be rejected`);
    }
  });

  it("rejects empty, zero, negative and non-numeric input", () => {
    for (const bad of ["", "   ", "0", "0.00", "-5", "-1,000", "abc", "10 0", "₦100", "1e5"]) {
      const res = parseAmount(bad);
      assert.equal(res.ok, false, `${JSON.stringify(bad)} should be rejected`);
    }
  });

  it("rejects unsupported precision", () => {
    assert.equal(parseAmount("10.999").ok, false);
    assert.equal(parseAmount("100,000.555").ok, false);
  });

  it("rejects over-limit and non-finite values", () => {
    assert.equal(parseAmount("100,000,001").ok, false);
    assert.equal(parseAmount("99999999999").ok, false);
    assert.equal(parseAmount(Infinity).ok, false);
    assert.equal(parseAmount(NaN).ok, false);
  });

  it("accepts numeric input within limits", () => {
    assert.deepEqual(parseAmount(100000), { ok: true, value: 100000 });
  });
});

describe("parseTransferAmount", () => {
  it("accepts the exact minimum and maximum boundaries", () => {
    assert.deepEqual(parseTransferAmount("100"), { ok: true, value: 100 });
    assert.deepEqual(parseTransferAmount("1,000,000"), { ok: true, value: 1000000 });
  });

  it("rejects amounts below ₦100", () => {
    for (const bad of ["1", "99", "99.99"]) {
      assert.equal(parseTransferAmount(bad).ok, false, `${bad} should be rejected`);
    }
  });

  it("rejects amounts above ₦1,000,000", () => {
    for (const bad of ["1,000,000.01", "1000001", "5000000"]) {
      assert.equal(parseTransferAmount(bad).ok, false, `${bad} should be rejected`);
    }
  });

  it("still rejects malformed input", () => {
    for (const bad of ["", "abc", "10.999", "-5", "0"]) {
      assert.equal(parseTransferAmount(bad).ok, false, `${JSON.stringify(bad)} should be rejected`);
    }
  });
});
