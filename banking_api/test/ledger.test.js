// Phase 1b ledger integrity tests: transfer limits, references, narration,
// zero fees, historical compatibility, and idempotency (replay, mismatch,
// concurrency) across transfers, deposits, and admin credits.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("ledger integrity", () => {
  let server;
  let base;
  let adminToken;
  let carolToken;
  let daveToken;
  let carolAccount;
  let daveAccount;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    await api(base, "POST", "/api/auth/register", {
      body: { name: "Carol Ledger", email: "carol.ledger@example.com", password: "Carol123!" },
    });
    await api(base, "POST", "/api/auth/register", {
      body: { name: "Dave Ledger", email: "dave.ledger@example.com", password: "Dave12345!" },
    });

    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token;
    carolToken = (await login(base, "carol.ledger@example.com", "Carol123!")).data.token;
    daveToken = (await login(base, "dave.ledger@example.com", "Dave12345!")).data.token;

    carolAccount = (await api(base, "GET", "/api/auth/me", { token: carolToken })).data.data.accountNumber;
    daveAccount = (await api(base, "GET", "/api/auth/me", { token: daveToken })).data.data.accountNumber;

    await api(base, "POST", "/api/account/pin/create", { token: carolToken, body: { pin: "1111" } });
    await api(base, "POST", "/api/account/pin/create", { token: daveToken, body: { pin: "2222" } });

    // Admin credits carry no per-operation limit in this phase.
    await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: carolAccount, amount: 2000000 },
    });
  });

  after(async () => {
    await teardown(server);
  });

  async function balance(token) {
    return (await api(base, "GET", "/api/account/balance", { token })).data.balance;
  }

  async function history(token) {
    return (await api(base, "GET", "/api/account/transactions", { token })).data.data;
  }

  function transfer(body, token = carolToken) {
    return api(base, "POST", "/api/transfer", { token, body });
  }

  it("rejects transfers below the ₦100 minimum", async () => {
    for (const amount of [1, 99, 99.99]) {
      const res = await transfer({ receiverAccountNumber: daveAccount, amount, pin: "1111" });
      assert.equal(res.status, 400, `${amount} should be rejected`);
    }
    assert.equal(await balance(carolToken), 2000000);
  });

  it("rejects transfers above the ₦1,000,000 maximum", async () => {
    for (const amount of [1000000.01, 1000001, 5000000]) {
      const res = await transfer({ receiverAccountNumber: daveAccount, amount, pin: "1111" });
      assert.equal(res.status, 400, `${amount} should be rejected`);
    }
    assert.equal(await balance(carolToken), 2000000);
  });

  it("accepts the exact minimum and maximum boundaries", async () => {
    const min = await transfer({
      receiverAccountNumber: daveAccount, amount: 100, pin: "1111", idempotencyKey: "boundary-min-1",
    });
    assert.equal(min.status, 200);
    const max = await transfer({
      receiverAccountNumber: daveAccount, amount: 1000000, pin: "1111", idempotencyKey: "boundary-max-1",
    });
    assert.equal(max.status, 200);
    assert.equal(await balance(carolToken), 2000000 - 100 - 1000000);
  });

  it("records unique references, narration, and a zero fee", async () => {
    const first = await transfer({
      receiverAccountNumber: daveAccount, amount: 500, pin: "1111",
      narration: "Lunch refund", idempotencyKey: "narrate-1",
    });
    const second = await transfer({
      receiverAccountNumber: daveAccount, amount: 500, pin: "1111", idempotencyKey: "narrate-2",
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.match(first.data.reference, /^NVR-\d{8}-[0-9A-F]{12}$/);
    assert.match(second.data.reference, /^NVR-\d{8}-[0-9A-F]{12}$/);
    assert.notEqual(first.data.reference, second.data.reference);
    assert.equal(first.data.fee, 0);
    assert.equal(first.data.narration, "Lunch refund");
    assert.equal(second.data.narration, null);

    const txns = await history(carolToken);
    const recorded = txns.find((t) => t.reference === first.data.reference);
    assert.ok(recorded, "transfer must appear in history by reference");
    assert.equal(recorded.narration, "Lunch refund");
    assert.equal(recorded.fee, 0);
    assert.equal(recorded.amount, 500);
  });

  it("rejects over-long narration without moving money", async () => {
    const before = await balance(carolToken);
    const res = await transfer({
      receiverAccountNumber: daveAccount, amount: 500, pin: "1111",
      narration: "x".repeat(141),
    });
    assert.equal(res.status, 400);
    assert.equal(await balance(carolToken), before);
  });

  it("keeps historical records readable with backfilled references", async () => {
    const txns = await history(carolToken);
    assert.ok(txns.length > 0);
    for (const t of txns) {
      assert.equal(typeof t.reference, "string", `txn ${t.id} must carry a reference`);
      assert.ok(t.reference.length > 0);
      assert.equal(typeof t.fee, "number");
    }
  });

  it("replays the same key without a second debit", async () => {
    const before = await balance(carolToken);
    const payload = {
      receiverAccountNumber: daveAccount, amount: 1000, pin: "1111", idempotencyKey: "replay-1",
    };
    const first = await transfer(payload);
    const second = await transfer(payload);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.equal(await balance(carolToken), before - 1000);

    const txns = await history(carolToken);
    const matches = txns.filter((t) => t.reference === first.data.reference);
    assert.equal(matches.length, 1, "exactly one ledger row for the replayed key");
  });

  it("rejects the same key with a different payload and moves nothing", async () => {
    const beforeCarol = await balance(carolToken);
    const beforeDave = await balance(daveToken);
    const first = await transfer({
      receiverAccountNumber: daveAccount, amount: 1100, pin: "1111", idempotencyKey: "mismatch-1",
    });
    assert.equal(first.status, 200);
    const second = await transfer({
      receiverAccountNumber: daveAccount, amount: 1200, pin: "1111", idempotencyKey: "mismatch-1",
    });
    assert.equal(second.status, 409);
    assert.equal(await balance(carolToken), beforeCarol - 1100);
    assert.equal(await balance(daveToken), beforeDave + 1100);
  });

  it("rejects cross-user key reuse without leaking the original outcome", async () => {
    const carolBefore = await balance(carolToken);
    const daveBefore = await balance(daveToken);
    const first = await transfer({
      receiverAccountNumber: daveAccount, amount: 900, pin: "1111", idempotencyKey: "cross-user-1",
    });
    assert.equal(first.status, 200);
    const originalReference = first.data.reference;
    assert.ok(originalReference);

    // Dave reuses Carol's key with an otherwise-valid request of his own.
    const second = await transfer({
      receiverAccountNumber: carolAccount, amount: 900, pin: "2222", idempotencyKey: "cross-user-1",
    }, daveToken);
    assert.equal(second.status, 409);
    assert.equal(second.data.success, false);
    assert.equal(
      second.data.message,
      "Idempotency key is already in use. Retry with a new key."
    );
    // No part of Carol's stored response may reach Dave.
    assert.equal(second.data.reference, undefined);
    assert.equal(second.data.newBalance, undefined);
    assert.equal(second.data.data, undefined);
    assert.ok(
      !JSON.stringify(second.data).includes(originalReference),
      "rejection must not leak the original reference"
    );

    // Neither balance moves; the original transaction remains intact.
    assert.equal(await balance(carolToken), carolBefore - 900);
    assert.equal(await balance(daveToken), daveBefore + 900);
    const txns = await history(carolToken);
    assert.equal(
      txns.filter((t) => t.reference === originalReference).length,
      1,
      "original committed transaction must remain exactly once"
    );
  });

  it("serializes concurrent duplicates into exactly one operation", async () => {
    const before = await balance(carolToken);
    const payload = {
      receiverAccountNumber: daveAccount, amount: 200, pin: "1111", idempotencyKey: "concurrent-1",
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => transfer({ ...payload }))
    );
    for (const r of results) {
      assert.equal(r.status, 200);
    }
    const references = new Set(results.map((r) => r.data.reference));
    assert.equal(references.size, 1, "all concurrent duplicates share one reference");
    assert.equal(await balance(carolToken), before - 200);
  });

  it("rejects malformed idempotency keys without moving money", async () => {
    const before = await balance(carolToken);
    const res = await transfer({
      receiverAccountNumber: daveAccount, amount: 500, pin: "1111", idempotencyKey: "bad key!!",
    });
    assert.equal(res.status, 400);
    assert.equal(await balance(carolToken), before);
  });

  it("lets a failed validation reuse its key for a later valid attempt", async () => {
    // No key is consumed by failures: validation runs before the key claim.
    const poor = await transfer({
      receiverAccountNumber: daveAccount, amount: 99999999, pin: "1111", idempotencyKey: "reuse-1",
    });
    assert.equal(poor.status, 400);
    const good = await transfer({
      receiverAccountNumber: daveAccount, amount: 700, pin: "1111", idempotencyKey: "reuse-1",
    });
    assert.equal(good.status, 200);
  });

  it("makes deposits idempotent", async () => {
    const before = await balance(daveToken);
    const payload = { amount: 2500, idempotencyKey: "deposit-1" };
    const first = await api(base, "POST", "/api/account/deposit", { token: daveToken, body: payload });
    const second = await api(base, "POST", "/api/account/deposit", { token: daveToken, body: payload });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.ok(first.data.reference);
    assert.equal(await balance(daveToken), before + 2500);
  });

  it("makes admin credits idempotent and records the reason", async () => {
    const before = await balance(daveToken);
    const payload = {
      accountNumber: daveAccount, amount: 3000, reason: "Test grant", idempotencyKey: "credit-1",
    };
    const first = await api(base, "POST", "/api/admin/credit", { token: adminToken, body: payload });
    const second = await api(base, "POST", "/api/admin/credit", { token: adminToken, body: payload });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.ok(first.data.data.transaction.reference);
    assert.equal(first.data.data.transaction.narration, "Test grant");
    assert.equal(await balance(daveToken), before + 3000);
  });

  it("rejects admin-credit key reuse with different details", async () => {
    const before = await balance(daveToken);
    const first = await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: daveAccount, amount: 3100, idempotencyKey: "credit-2" },
    });
    assert.equal(first.status, 200);
    const second = await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: daveAccount, amount: 3200, idempotencyKey: "credit-2" },
    });
    assert.equal(second.status, 409);
    assert.equal(await balance(daveToken), before + 3100);
  });
});
