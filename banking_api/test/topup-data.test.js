// Phase 3 Stage 3: data purchase backend. Covers server-authoritative
// pricing, snapshot persistence, all rejection paths, idempotency, and
// history ownership alongside pre-existing ledger types.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("topup data purchases", () => {
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
        name: "Data Buyer", identifier: "08030300101", password: "Databuyer1!",
        pin: "5656", pinConfirm: "5656",
      },
    });
    assert.equal(reg.status, 201);
    userAccount = reg.data.data.accountNumber;
    userToken = (await login(base, "08030300101", "Databuyer1!")).data.token;

    const credit = await api(base, "POST", "/api/admin/credit", {
      token: adminToken, body: { accountNumber: userAccount, amount: 40000 },
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
    return { transactions: t.rows[0].n, purchases: p.rows[0].n };
  }

  function buyData(overrides = {}, token = userToken) {
    return api(base, "POST", "/api/topup/data", {
      token,
      body: {
        recipientMsisdn: "08012345678",
        network: "Glo",
        bundleCode: "GLO-7GB-30D",
        pin: "5656",
        idempotencyKey: randomUUID(),
        ...overrides,
      },
    });
  }

  it("charges the exact catalogue price and snapshots the bundle", async () => {
    const before = await balance();
    const res = await buyData();
    assert.equal(res.status, 200);
    const body = res.data;
    assert.equal(body.success, true);
    assert.ok(body.reference.startsWith("NVR-"));
    assert.equal(body.kind, "data");
    assert.equal(body.network, "Glo");
    assert.equal(body.amount, 2000);
    assert.equal(body.fee, 0);
    assert.deepEqual(body.bundle, {
      code: "GLO-7GB-30D", name: "Glo 7GB Monthly", allowance: "7 GB", validity: "30 days",
    });
    assert.equal(body.newBalance, before - 2000);
    assert.ok(body.message.includes("Simulated"));

    const pool = await testPool();
    const ledger = await pool.query("SELECT * FROM transactions WHERE reference = $1", [body.reference]);
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].type, "data");
    assert.equal(ledger.rows[0].receiver_account_id, null);
    assert.equal(Number(ledger.rows[0].amount), 2000);

    const detail = await pool.query("SELECT * FROM purchases WHERE transaction_id = $1", [ledger.rows[0].id]);
    assert.equal(detail.rows[0].bundle_code, "GLO-7GB-30D");
    assert.equal(detail.rows[0].bundle_name, "Glo 7GB Monthly");
    assert.equal(detail.rows[0].allowance, "7 GB");
    assert.equal(detail.rows[0].validity, "30 days");

    const note = await pool.query("SELECT * FROM notifications WHERE reference = $1", [body.reference]);
    assert.equal(note.rowCount, 1);
    assert.equal(note.rows[0].event_type, "data_purchased");
    assert.equal(note.rows[0].destination, "/history");
  });

  it("rejects price manipulation and unknown fields", async () => {
    const before = await balance();
    const counts = await rowCounts();
    for (const extra of [
      { price: 1 },
      { price: 2000 },
      { amount: 100 },
      { amount: 2000 },
      { narration: "smuggle" },
    ]) {
      const res = await buyData(extra);
      assert.equal(res.status, 400, `extra ${JSON.stringify(extra)} rejected`);
    }
    assert.equal(await balance(), before);
    assert.deepEqual(await rowCounts(), counts);
  });

  it("rejects unknown and cross-network bundle codes", async () => {
    const counts = await rowCounts();
    const unknown = await buyData({ bundleCode: "MTN-999GB-30D" });
    assert.equal(unknown.status, 400);
    const cross = await buyData({ network: "MTN", bundleCode: "ATL-5GB-30D" });
    assert.equal(cross.status, 400);
    assert.ok(cross.data.message.includes("Airtel"), "names the owning network");
    assert.equal((await buyData({ bundleCode: "" })).status, 400);
    assert.deepEqual(await rowCounts(), counts);
  });

  it("rejects bad recipients, networks, PINs, and short balances unchanged", async () => {
    const counts = await rowCounts();
    assert.equal((await buyData({ network: "Etisalat" })).status, 400);
    assert.equal((await buyData({ recipientMsisdn: "+15551234567" })).status, 400);
    assert.equal((await buyData({ pin: "0000" })).status, 403);
    assert.equal((await buyData({ pin: undefined })).status, 400);
    assert.equal((await buyData({ idempotencyKey: undefined })).status, 400);

    const poor = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Data Poor", identifier: "08030300103", password: "Datapoor1!",
        pin: "0101", pinConfirm: "0101",
      },
    });
    assert.equal(poor.status, 201);
    const poorToken = (await login(base, "08030300103", "Datapoor1!")).data.token;
    const denied = await buyData({ pin: "0101" }, poorToken);
    assert.equal(denied.status, 400);
    assert.deepEqual(await rowCounts(), counts);
  });

  it("replays same key and payload, conflicts on payload mismatch", async () => {
    const key = randomUUID();
    const before = await balance();
    const payload = { bundleCode: "MTN-1P5GB-30D", network: "MTN" };
    const first = await buyData({ ...payload, idempotencyKey: key });
    assert.equal(first.status, 200);
    assert.equal(first.data.amount, 1000);
    const second = await buyData({ ...payload, idempotencyKey: key });
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, first.data);
    assert.equal(await balance(), before - 1000);

    const conflict = await buyData({ bundleCode: "MTN-4P5GB-30D", network: "MTN", idempotencyKey: key });
    assert.equal(conflict.status, 409);
    assert.ok(!JSON.stringify(conflict.data).includes(first.data.reference));
  });

  it("rejects cross-user key reuse and executes concurrent duplicates once", async () => {
    const key = randomUUID();
    const first = await buyData({ bundleCode: "9M-1GB-7D", network: "9mobile", idempotencyKey: key });
    assert.equal(first.status, 200);

    const other = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Data Other", identifier: "08030300102", password: "Dataother1!",
        pin: "8989", pinConfirm: "8989",
      },
    });
    assert.equal(other.status, 201);
    const otherToken = (await login(base, "08030300102", "Dataother1!")).data.token;
    const fundOther = await api(base, "POST", "/api/admin/credit", {
      token: adminToken, body: { accountNumber: other.data.data.accountNumber, amount: 5000 },
    });
    assert.equal(fundOther.status, 200);
    const res = await buyData({ bundleCode: "9M-1GB-7D", network: "9mobile", pin: "8989", idempotencyKey: key }, otherToken);
    assert.equal(res.status, 409);
    assert.ok(!JSON.stringify(res.data).includes(first.data.reference));

    const ckey = randomUUID();
    const before = await balance();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(base, "POST", "/api/topup/data", {
          token: userToken,
          body: {
            recipientMsisdn: "09012345678", network: "Airtel", bundleCode: "ATL-1P5GB-30D",
            pin: "5656", idempotencyKey: ckey,
          },
        })
      )
    );
    for (const r of results) assert.equal(r.status, 200);
    assert.equal(new Set(results.map((r) => r.data.reference)).size, 1);
    assert.equal(await balance(), before - 1000);

    const pool = await testPool();
    const dupes = await pool.query(
      "SELECT COUNT(*)::int AS n FROM purchases WHERE bundle_code = 'ATL-1P5GB-30D' AND recipient_msisdn = '+2349012345678'"
    );
    assert.equal(dupes.rows[0].n, 1);
  });

  it("shows data history to the owner only, beside existing ledger types", async () => {
    const mine = await api(base, "GET", "/api/account/transactions", { token: userToken });
    assert.equal(mine.status, 200);
    const types = mine.data.data.map((t) => t.type);
    assert.ok(types.includes("data"));
    assert.ok(types.includes("admin_credit"));
    const dataRow = mine.data.data.find((t) => t.type === "data");
    assert.equal(dataRow.receiverId, null);
    assert.equal(dataRow.fee, 0);

    const otherToken = (await login(base, "08030300102", "Dataother1!")).data.token;
    const theirs = await api(base, "GET", "/api/account/transactions", { token: otherToken });
    const myRefs = new Set(mine.data.data.map((t) => t.reference));
    for (const t of theirs.data.data) {
      if (t.type === "data" || t.type === "airtime") {
        assert.ok(!myRefs.has(t.reference), "purchase rows never leak across users");
      }
    }
  });
});
