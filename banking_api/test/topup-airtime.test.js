// Phase 3 Stage 2: airtime purchase backend. Covers success, exact money
// movement, ledger/purchase/notification rows, all rejection paths (with
// unchanged balances and row counts), and idempotency semantics.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("topup airtime purchases", () => {
  let server;
  let base;
  let adminToken;
  let userToken;
  let userAccount;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);
    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token;

    const reg = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Airtime Buyer", identifier: "08030200101", password: "Airtimebuyer1!",
        pin: "4545", pinConfirm: "4545",
      },
    });
    assert.equal(reg.status, 201);
    userAccount = reg.data.data.accountNumber;
    userToken = (await login(base, "08030200101", "Airtimebuyer1!")).data.token;

    const credit = await api(base, "POST", "/api/admin/credit", {
      token: adminToken, body: { accountNumber: userAccount, amount: 30000 },
    });
    assert.equal(credit.status, 200);
  });

  after(async () => {
    await teardown(server);
  });

  async function balance() {
    const res = await api(base, "GET", "/api/account/balance", { token: userToken });
    assert.equal(res.status, 200);
    return res.data.balance;
  }

  async function rowCounts() {
    const pool = await testPool();
    const t = await pool.query("SELECT COUNT(*)::int AS n FROM transactions");
    const p = await pool.query("SELECT COUNT(*)::int AS n FROM purchases");
    const n = await pool.query("SELECT COUNT(*)::int AS n FROM notifications");
    return { transactions: t.rows[0].n, purchases: p.rows[0].n, notifications: n.rows[0].n };
  }

  function buy(overrides = {}, token = userToken) {
    return api(base, "POST", "/api/topup/airtime", {
      token,
      body: {
        recipientMsisdn: "08012345678",
        network: "MTN",
        amount: 500,
        pin: "4545",
        idempotencyKey: randomUUID(),
        ...overrides,
      },
    });
  }

  it("completes a simulated airtime purchase with exact money movement", async () => {
    const before = await balance();
    const res = await buy({ narration: "Stage 2 probe" });
    assert.equal(res.status, 200);
    const body = res.data;
    assert.equal(body.success, true);
    assert.ok(body.reference.startsWith("NVR-"));
    assert.equal(body.kind, "airtime");
    assert.equal(body.network, "MTN");
    assert.equal(body.recipientMsisdn, "+2348012345678");
    assert.equal(body.amount, 500);
    assert.equal(body.fee, 0);
    assert.equal(body.narration, "Stage 2 probe");
    assert.equal(body.bundle, null);
    assert.equal(body.newBalance, before - 500);
    assert.ok(body.message.includes("Simulated"));
    assert.ok(body.timestamp);

    const pool = await testPool();
    const ledger = await pool.query("SELECT * FROM transactions WHERE reference = $1", [body.reference]);
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].type, "airtime");
    assert.equal(ledger.rows[0].receiver_account_id, null);
    assert.equal(Number(ledger.rows[0].amount), 500);
    assert.equal(Number(ledger.rows[0].fee), 0);

    const detail = await pool.query("SELECT * FROM purchases WHERE transaction_id = $1", [ledger.rows[0].id]);
    assert.equal(detail.rowCount, 1);
    assert.equal(detail.rows[0].kind, "airtime");
    assert.equal(detail.rows[0].network, "MTN");
    assert.equal(detail.rows[0].recipient_msisdn, "+2348012345678");
    assert.equal(detail.rows[0].bundle_code, null);
    assert.equal(Number(detail.rows[0].amount), 500);

    const note = await pool.query("SELECT * FROM notifications WHERE reference = $1", [body.reference]);
    assert.equal(note.rowCount, 1);
    assert.equal(note.rows[0].event_type, "airtime_purchased");
    assert.equal(note.rows[0].destination, "/history");
    assert.ok(!note.rows[0].message.includes("08012345678"), "full number not in notification");
  });

  it("accepts boundary amounts and rejects out-of-range or malformed ones", async () => {
    for (const amount of [100, 10000]) {
      const res = await buy({ amount });
      assert.equal(res.status, 200, `amount ${amount} accepted`);
    }
    const before = await balance();
    const counts = await rowCounts();
    for (const amount of [99, 10001, 0, -5, "abc", "", "10.999", null]) {
      const res = await buy({ amount });
      assert.equal(res.status, 400, `amount ${JSON.stringify(amount)} rejected`);
    }
    assert.equal(await balance(), before);
    assert.deepEqual(await rowCounts(), counts);
  });

  it("rejects invalid networks and recipient numbers without moving money", async () => {
    const before = await balance();
    const counts = await rowCounts();
    for (const network of ["MNT", "", null, "mtn", "MTN "]) {
      if (network === "MTN ") continue; // trimmed exact match is accepted; tested below
      const res = await buy({ network });
      assert.equal(res.status, 400, `network ${JSON.stringify(network)} rejected`);
    }
    const trimmed = await buy({ network: "MTN " });
    assert.equal(trimmed.status, 200, "surrounding whitespace is trimmed");
    for (const recipientMsisdn of ["+15551234567", "abc", "", null, "08012345", "+234801234567890123"]) {
      const res = await buy({ recipientMsisdn });
      assert.equal(res.status, 400, `msisdn ${JSON.stringify(recipientMsisdn)} rejected`);
    }
    // Local spellings normalize to the same E.164 identity.
    for (const spelling of ["2348012345678", "+2348012345678", "0801 234 5678"]) {
      const res = await buy({ recipientMsisdn: spelling });
      assert.equal(res.status, 200, `spelling ${spelling} accepted`);
      assert.equal(res.data.recipientMsisdn, "+2348012345678");
    }
    assert.deepEqual(await rowCounts(), { ...counts, transactions: counts.transactions + 4, purchases: counts.purchases + 4, notifications: counts.notifications + 4 });
  });

  it("rejects unknown fields, especially client-supplied prices", async () => {
    const before = await balance();
    const counts = await rowCounts();
    for (const extra of [{ price: 1 }, { amount: 500, price: 500 }, { bundleCode: "MTN-1GB-30D" }, { bundle: {} }, { discount: 100 }]) {
      const res = await buy(extra);
      assert.equal(res.status, 400, `extra ${JSON.stringify(extra)} rejected`);
    }
    assert.equal(await balance(), before);
    assert.deepEqual(await rowCounts(), counts);
  });

  it("requires a valid idempotency key", async () => {
    const missing = await buy({ idempotencyKey: undefined });
    assert.equal(missing.status, 400);
    const malformed = await buy({ idempotencyKey: "not a key!!" });
    assert.equal(malformed.status, 400);
  });

  it("enforces PIN rules without moving money on failure", async () => {
    const before = await balance();
    const counts = await rowCounts();
    assert.equal((await buy({ pin: undefined })).status, 400);
    assert.equal((await buy({ pin: "0000" })).status, 403);

    const pool = await testPool();
    const user = await pool.query(
      "SELECT u.id FROM users u JOIN accounts a ON a.user_id = u.id WHERE a.account_number = $1",
      [userAccount]
    );
    await pool.query("UPDATE users SET pin_hash = NULL WHERE id = $1", [user.rows[0].id]);
    assert.equal((await buy({ pin: "4545" })).status, 400);
    const restored = await pool.query("SELECT pin_hash FROM users WHERE id = $1", [user.rows[0].id]);
    assert.equal(restored.rows[0].pin_hash, null);
    // Restore the PIN by re-setting it directly (hash of "4545").
    const bcrypt = require("bcrypt");
    await pool.query("UPDATE users SET pin_hash = $2 WHERE id = $1", [user.rows[0].id, await bcrypt.hash("4545", 10)]);
    assert.equal((await buy()).status, 200);

    assert.deepEqual(await rowCounts(), { ...counts, transactions: counts.transactions + 1, purchases: counts.purchases + 1, notifications: counts.notifications + 1 });
  });

  it("rejects insufficient funds and over-long narration unchanged", async () => {
    const poor = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Airtime Poor", identifier: "08030200103", password: "Airtimepoor1!",
        pin: "9090", pinConfirm: "9090",
      },
    });
    assert.equal(poor.status, 201);
    const poorToken = (await login(base, "08030200103", "Airtimepoor1!")).data.token;

    const counts = await rowCounts();
    const denied = await buy({ amount: 500, pin: "9090" }, poorToken);
    assert.equal(denied.status, 400);
    assert.ok(denied.data.message.includes("Insufficient"));
    assert.deepEqual(await rowCounts(), counts);

    assert.equal((await buy({ narration: "n".repeat(141) })).status, 400);
    const ok140 = await buy({ narration: "n".repeat(140) });
    assert.equal(ok140.status, 200);
    assert.equal(ok140.data.narration, "n".repeat(140));
  });

  it("replays the same key and payload without a second debit", async () => {
    const key = randomUUID();
    const before = await balance();
    const first = await buy({ amount: 700, idempotencyKey: key });
    assert.equal(first.status, 200);
    const second = await buy({ amount: 700, idempotencyKey: key });
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.equal(await balance(), before - 700);

    const pool = await testPool();
    const rows = await pool.query("SELECT COUNT(*)::int AS n FROM transactions WHERE reference = $1", [first.data.reference]);
    assert.equal(rows.rows[0].n, 1);
  });

  it("returns 409 for same key with different payload, without leaking", async () => {
    const key = randomUUID();
    const first = await buy({ amount: 600, idempotencyKey: key });
    assert.equal(first.status, 200);
    const conflict = await buy({ amount: 650, idempotencyKey: key });
    assert.equal(conflict.status, 409);
    assert.ok(!JSON.stringify(conflict.data).includes(first.data.reference), "no original outcome leaked");
  });

  it("rejects cross-user key reuse without exposing the original outcome", async () => {
    const key = randomUUID();
    const first = await buy({ amount: 550, idempotencyKey: key });
    assert.equal(first.status, 200);

    const other = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Airtime Other", identifier: "08030200102", password: "Airtimeother1!",
        pin: "7878", pinConfirm: "7878",
      },
    });
    assert.equal(other.status, 201);
    const otherToken = (await login(base, "08030200102", "Airtimeother1!")).data.token;
    // Fund the second user so the request reaches the idempotency claim.
    const fundOther = await api(base, "POST", "/api/admin/credit", {
      token: adminToken, body: { accountNumber: other.data.data.accountNumber, amount: 5000 },
    });
    assert.equal(fundOther.status, 200);

    const res = await buy({ amount: 550, pin: "7878", idempotencyKey: key }, otherToken);
    assert.equal(res.status, 409);
    assert.ok(!JSON.stringify(res.data).includes(first.data.reference));
  });

  it("executes concurrent duplicate requests exactly once", async () => {
    const key = randomUUID();
    const before = await balance();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(base, "POST", "/api/topup/airtime", {
          token: userToken,
          body: { recipientMsisdn: "08012345678", network: "Glo", amount: 800, pin: "4545", idempotencyKey: key },
        })
      )
    );
    for (const r of results) assert.equal(r.status, 200);
    const refs = new Set(results.map((r) => r.data.reference));
    assert.equal(refs.size, 1);
    assert.deepEqual(results.map((r) => r.data), results.map(() => results[0].data));
    assert.equal(await balance(), before - 800);
  });

  it("converges an aborted connection into exactly one purchase", async () => {
    const before = await balance();
    const counts = await rowCounts();
    const key = randomUUID();
    const payload = {
      recipientMsisdn: "08012345678", network: "MTN", amount: 900, pin: "4545", idempotencyKey: key,
    };

    // Destroy the socket mid-flight without reading the response: whether
    // the server commits before or after the destroy, the same-key retry
    // must converge to exactly one purchase (fresh execution or replay).
    await new Promise((resolve) => {
      const url = new URL("/api/topup/airtime", base);
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
            Authorization: `Bearer ${userToken}`,
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

    const retry = await api(base, "POST", "/api/topup/airtime", { token: userToken, body: payload });
    assert.equal(retry.status, 200);
    assert.equal(await balance(), before - 900);
    const after = await rowCounts();
    assert.equal(after.transactions, counts.transactions + 1);
    assert.equal(after.purchases, counts.purchases + 1);
    const pool = await testPool();
    const rows = await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE reference = $1", [retry.data.reference]);
    assert.equal(rows.rows[0].n, 1);
  });
});
