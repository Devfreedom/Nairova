// Transfer reliability and security verification (Phase 2.3): auth gaps,
// response-leakage scans, wrong-PIN key reuse, independent transfers, and
// lost-response/aborted-connection convergence to exactly one transfer.
// Rate-limited calls in this file: 5 (limit is 10).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");
const { transferFunds } = require("../src/db/store");
const { fingerprint } = require("../src/utils/ledger");

describe("transfer reliability", () => {
  let server;
  let base;
  let adminToken;
  let aliceToken;
  let bobToken;
  let aliceId;
  let aliceAccount;
  let bobAccount;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    await api(base, "POST", "/api/auth/register", { // 1
      body: { name: "Alice Rel", email: "alice.rel@example.com", password: "Alice123!", pin: "1234", pinConfirm: "1234" },
    });
    await api(base, "POST", "/api/auth/register", { // 2
      body: { name: "Bob Rel", email: "bob.rel@example.com", password: "Bob12345!", pin: "5678", pinConfirm: "5678" },
    });

    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token; // 3
    aliceToken = (await login(base, "alice.rel@example.com", "Alice123!")).data.token; // 4
    bobToken = (await login(base, "bob.rel@example.com", "Bob12345!")).data.token; // 5

    const aliceMe = (await api(base, "GET", "/api/auth/me", { token: aliceToken })).data.data;
    aliceId = aliceMe.id;
    aliceAccount = aliceMe.accountNumber;
    bobAccount = (await api(base, "GET", "/api/auth/me", { token: bobToken })).data.data.accountNumber;

    await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: aliceAccount, amount: 100000 },
    });
  });

  after(async () => {
    await teardown(server);
  });

  async function balance(token) {
    return (await api(base, "GET", "/api/account/balance", { token })).data.balance;
  }

  // Counts transfer ledger rows from Alice to Bob.
  async function transferRowCount() {
    const p = await testPool();
    const { rows } = await p.query(
      `SELECT COUNT(*)::int AS n FROM transactions t
       JOIN accounts s ON s.id = t.sender_account_id
       JOIN accounts r ON r.id = t.receiver_account_id
       WHERE t.type = 'transfer' AND s.account_number = $1 AND r.account_number = $2`,
      [aliceAccount, bobAccount]
    );
    return rows[0].n;
  }

  function transfer(body, token = aliceToken) {
    return api(base, "POST", "/api/transfer", { token, body });
  }

  it("rejects unauthenticated transfers without touching balances", async () => {
    const beforeAlice = await balance(aliceToken);
    const beforeBob = await balance(bobToken);
    const beforeRows = await transferRowCount();

    const anon = await api(base, "POST", "/api/transfer", {
      body: { receiverAccountNumber: bobAccount, amount: 500, pin: "1234" },
    });
    assert.equal(anon.status, 401);
    const forged = await api(base, "POST", "/api/transfer", {
      token: "forged-token",
      body: { receiverAccountNumber: bobAccount, amount: 500, pin: "1234" },
    });
    assert.equal(forged.status, 401);

    assert.equal(await balance(aliceToken), beforeAlice);
    assert.equal(await balance(bobToken), beforeBob);
    assert.equal(await transferRowCount(), beforeRows);
  });

  it("verifies recipients without leaking private details", async () => {
    const res = await api(base, "POST", `/api/account/verify/${bobAccount}`, { token: aliceToken });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.data.data).sort(), ["accountNumber", "name"]);
    assert.equal(res.data.data.name, "Bob Rel");

    const missing = await api(base, "POST", "/api/account/verify/0000000000", { token: aliceToken });
    assert.equal(missing.status, 404);

    const anon = await api(base, "POST", `/api/account/verify/${bobAccount}`);
    assert.equal(anon.status, 401);
  });

  it("keeps secrets out of error responses", async () => {
    const bodies = [];
    bodies.push(await transfer({ receiverAccountNumber: bobAccount, amount: 500, pin: "0000" }));
    bodies.push(await transfer({ receiverAccountNumber: bobAccount, amount: 99999999, pin: "1234" }));
    bodies.push(await transfer({ receiverAccountNumber: "0000000000", amount: 500, pin: "1234" }));
    bodies.push(await transfer({ receiverAccountNumber: bobAccount, amount: "abc", pin: "1234" }));
    for (const res of bodies) {
      assert.ok(res.status >= 400, `expected rejection, got ${res.status}`);
      const raw = JSON.stringify(res.data);
      for (const secret of ["password_hash", "pin_hash", "\"pin\"", "\"password\"", "JWT_SECRET", "token"]) {
        assert.ok(!raw.includes(secret), `error response must not contain ${secret}: ${raw}`);
      }
    }
  });

  it("reuses the key after a wrong PIN for a later success", async () => {
    const beforeAlice = await balance(aliceToken);
    const beforeBob = await balance(bobToken);
    const key = randomUUID();

    // The PIN check runs before the key claim, so the key is unconsumed.
    const denied = await transfer({ receiverAccountNumber: bobAccount, amount: 1200, pin: "0000", idempotencyKey: key });
    assert.equal(denied.status, 403);

    const ok = await transfer({ receiverAccountNumber: bobAccount, amount: 1200, pin: "1234", idempotencyKey: key });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.reference);

    assert.equal(await balance(aliceToken), beforeAlice - 1200);
    assert.equal(await balance(bobToken), beforeBob + 1200);
    const txns = (await api(base, "GET", "/api/account/transactions", { token: aliceToken })).data.data;
    assert.equal(txns.filter((t) => t.reference === ok.data.reference).length, 1);
  });

  it("executes independent transfers as distinct operations", async () => {
    const beforeAlice = await balance(aliceToken);
    const first = await transfer({ receiverAccountNumber: bobAccount, amount: 1100, pin: "1234", idempotencyKey: randomUUID() });
    const second = await transfer({ receiverAccountNumber: bobAccount, amount: 1300, pin: "1234", idempotencyKey: randomUUID() });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.notEqual(first.data.reference, second.data.reference);
    assert.equal(await balance(aliceToken), beforeAlice - 1100 - 1300);
  });

  it("rejects a missing PIN without moving money", async () => {
    const beforeAlice = await balance(aliceToken);
    const beforeRows = await transferRowCount();
    const res = await transfer({ receiverAccountNumber: bobAccount, amount: 500, idempotencyKey: randomUUID() });
    assert.equal(res.status, 400);
    assert.equal(await balance(aliceToken), beforeAlice);
    assert.equal(await transferRowCount(), beforeRows);
  });

  it("accepts narration at exactly 140 characters and records it", async () => {
    const note = "n".repeat(140);
    const res = await transfer({
      receiverAccountNumber: bobAccount, amount: 600, pin: "1234", narration: note, idempotencyKey: randomUUID(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.narration, note);
    const txns = (await api(base, "GET", "/api/account/transactions", { token: aliceToken })).data.data;
    const recorded = txns.find((t) => t.reference === res.data.reference);
    assert.ok(recorded, "140-char narration must round-trip through history");
    assert.equal(recorded.narration, note);
  });

  it("converges a real commit plus lost response into one transfer on retry", async () => {
    // A genuine commit through the production store path (the same function
    // the transfer endpoint calls), then the HTTP retry the frontend would
    // send after never receiving the original response.
    const beforeAlice = await balance(aliceToken);
    const beforeBob = await balance(bobToken);
    const key = randomUUID();
    const amountText = (1500).toFixed(2);

    const committed = await transferFunds({
      senderUserId: aliceId,
      receiverAccountNumber: bobAccount,
      amountText,
      narration: null,
      idempotencyKey: key,
      // Byte-identical to the controller's fingerprint for this payload.
      fingerprint: fingerprint(["transfer", String(aliceId), amountText, bobAccount, "", "0.00"]),
      displayAmount: 1500,
    });
    assert.ok(committed.body && committed.body.reference, "store path must commit");

    const retry = await transfer({
      receiverAccountNumber: bobAccount, amount: 1500, pin: "1234", idempotencyKey: key,
    });
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.data, committed.body);

    assert.equal(await balance(aliceToken), beforeAlice - 1500);
    assert.equal(await balance(bobToken), beforeBob + 1500);
    const txns = (await api(base, "GET", "/api/account/transactions", { token: aliceToken })).data.data;
    assert.equal(txns.filter((t) => t.reference === committed.body.reference).length, 1);
  });

  it("converges an aborted connection into exactly one transfer", async () => {
    const beforeAlice = await balance(aliceToken);
    const beforeBob = await balance(bobToken);
    const beforeRows = await transferRowCount();
    const key = randomUUID();
    const payload = { receiverAccountNumber: bobAccount, amount: 1400, pin: "1234", idempotencyKey: key };

    // Fire the request and destroy the socket mid-flight without reading the
    // response. Whether the server commits before or after the destroy, the
    // same-key retry below must converge to exactly one transfer: either the
    // first call never executed (retry executes fresh) or it committed
    // (retry replays). Both interleavings are exactly-once by construction.
    await new Promise((resolve) => {
      const url = new URL("/api/transfer", base);
      const body = JSON.stringify(payload);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: `Bearer ${aliceToken}`,
          },
        },
        (res) => res.resume()
      );
      req.on("error", () => resolve());
      req.end(body);
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 150);
    });

    const retry = await transfer(payload);
    assert.equal(retry.status, 200);

    assert.equal(await transferRowCount(), beforeRows + 1);
    assert.equal(await balance(aliceToken), beforeAlice - 1400);
    assert.equal(await balance(bobToken), beforeBob + 1400);
    const txns = (await api(base, "GET", "/api/account/transactions", { token: aliceToken })).data.data;
    assert.equal(txns.filter((t) => t.reference === retry.data.reference).length, 1);
  });
});
