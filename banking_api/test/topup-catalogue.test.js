// Phase 3 Stage 1: catalogue + migration + history-compatibility regression.
// No money movement beyond pre-existing operation types (deposit,
// admin_credit, transfer); no purchase execution exists yet.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");
const { runMigrations, getStatus } = require("../src/db/migrate");
const {
  CATALOGUE_VERSION,
  NETWORKS,
  AIRTIME_PRESETS,
  AIRTIME_MIN_AMOUNT,
  AIRTIME_MAX_AMOUNT,
  BUNDLES,
  validateCatalogue,
  isSupportedNetwork,
  getBundle,
} = require("../src/utils/topupCatalogue");

describe("topup catalogue and migration", () => {
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
        name: "Topup User", identifier: "08030100101", password: "Topupuser1!",
        pin: "1212", pinConfirm: "1212",
      },
    });
    assert.equal(reg.status, 201);
    userAccount = reg.data.data.accountNumber;
    userToken = (await login(base, "08030100101", "Topupuser1!")).data.token;
  });

  after(async () => {
    await teardown(server);
  });

  it("requires authentication for the catalogue", async () => {
    const res = await api(base, "GET", "/api/topup/catalogue");
    assert.equal(res.status, 401);
  });

  it("returns the approved server-authoritative catalogue", async () => {
    const res = await api(base, "GET", "/api/topup/catalogue", { token: userToken });
    assert.equal(res.status, 200);
    const data = res.data.data;
    assert.equal(data.version, 1);
    assert.equal(data.version, CATALOGUE_VERSION);
    assert.deepEqual(data.networks, ["MTN", "Airtel", "Glo", "9mobile"]);
    assert.deepEqual(data.airtimePresets, [200, 500, 1000, 2000, 5000, 10000]);
    assert.equal(data.airtimeMin, 100);
    assert.equal(data.airtimeMax, 10000);
    assert.equal(data.bundles.length, 19);
    const codes = new Set();
    for (const b of data.bundles) {
      for (const f of ["code", "network", "name", "allowance", "validity"]) {
        assert.ok(typeof b[f] === "string" && b[f].trim() !== "", `bundle ${f} non-empty`);
      }
      assert.ok(Number.isInteger(b.price) && b.price > 0, "bundle price positive integer");
      assert.ok(data.networks.includes(b.network), "bundle network supported");
      assert.ok(!codes.has(b.code), `bundle code unique: ${b.code}`);
      codes.add(b.code);
    }
  });

  it("validates catalogue structure and rejects malformed fixtures", async () => {
    assert.deepEqual(
      validateCatalogue({ networks: [...NETWORKS], bundles: BUNDLES.map((b) => ({ ...b })), presets: [...AIRTIME_PRESETS] }),
      []
    );
    const dupes = BUNDLES.map((b) => ({ ...b }));
    dupes[1] = { ...dupes[0] };
    assert.ok(validateCatalogue({ networks: [...NETWORKS], bundles: dupes, presets: [...AIRTIME_PRESETS] }).some((p) => p.includes("duplicates")));
    assert.ok(validateCatalogue({
      networks: [...NETWORKS],
      bundles: [{ code: "X-1", network: "NoTel", name: "x", allowance: "1 GB", validity: "7 days", price: 100 }],
      presets: [...AIRTIME_PRESETS],
    }).some((p) => p.includes("unsupported network")));
    assert.ok(validateCatalogue({
      networks: [...NETWORKS],
      bundles: [{ code: "X-2", network: "MTN", name: "", allowance: "1 GB", validity: "7 days", price: 0 }],
      presets: [...AIRTIME_PRESETS],
    }).length >= 2);
    assert.ok(validateCatalogue({ networks: [], bundles: [], presets: [] }).length > 0);
    assert.ok(!isSupportedNetwork("NoTel"));
    assert.ok(isSupportedNetwork(" MTN "));
    assert.equal(getBundle("MTN", "ATL-5GB-30D"), null);
    assert.equal(getBundle("Airtel", "ATL-5GB-30D").price, 2000);
  });

  it("keeps supporting every existing transaction type", async () => {
    const credit = await api(base, "POST", "/api/admin/credit", {
      token: adminToken, body: { accountNumber: userAccount, amount: 5000 },
    });
    assert.equal(credit.status, 200);

    const deposit = await api(base, "POST", "/api/account/deposit", {
      token: userToken, body: { amount: 2000 },
    });
    assert.equal(deposit.status, 200);

    const other = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Topup Other", identifier: "08030100102", password: "Topupother1!",
        pin: "3434", pinConfirm: "3434",
      },
    });
    assert.equal(other.status, 201);

    const moved = await api(base, "POST", "/api/transfer", {
      token: userToken,
      body: { receiverAccountNumber: other.data.data.accountNumber, amount: 1500, pin: "1212" },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.newBalance, 5500);

    const history = await api(base, "GET", "/api/account/transactions", { token: userToken });
    assert.equal(history.status, 200);
    const types = history.data.data.map((t) => t.type);
    assert.ok(types.includes("deposit"), "deposit row present");
    assert.ok(types.includes("admin_credit"), "admin_credit row present");
    assert.ok(types.includes("transfer"), "transfer row present");
    for (const t of history.data.data) {
      assert.ok(typeof t.reference === "string" && t.reference.startsWith("NVR-"));
      assert.equal(t.fee, 0);
    }
    const sent = history.data.data.find((t) => t.type === "transfer");
    assert.equal(sent.receiverAccountNumber, other.data.data.accountNumber);
  });

  it("shows NULL-receiver purchase-style rows to the owner only", async () => {
    const pool = await testPool();
    const acct = await pool.query("SELECT id FROM accounts WHERE account_number = $1", [userAccount]);
    const senderAccountId = acct.rows[0].id;
    await pool.query(
      `INSERT INTO transactions (type, sender_account_id, receiver_account_id, amount, fee, narration, reference, status)
       VALUES ('airtime', $1, NULL, 500, 0, 'Stage 1 probe', 'NVR-TEST-NULLRCV-01', 'success')`,
      [senderAccountId]
    );

    const mine = await api(base, "GET", "/api/account/transactions", { token: userToken });
    const probe = mine.data.data.find((t) => t.reference === "NVR-TEST-NULLRCV-01");
    assert.ok(probe, "owner sees the NULL-receiver row");
    assert.equal(probe.type, "airtime");
    assert.equal(probe.receiverId, null);
    assert.equal(probe.receiverAccountNumber, null);

    const otherToken = (await login(base, "08030100102", "Topupother1!")).data.token;
    const theirs = await api(base, "GET", "/api/account/transactions", { token: otherToken });
    assert.ok(!theirs.data.data.some((t) => t.reference === "NVR-TEST-NULLRCV-01"), "no cross-user exposure");

    await pool.query("DELETE FROM transactions WHERE reference = 'NVR-TEST-NULLRCV-01'");
  });

  it("accepts new purchase types and purchase notifications, rejects unknown ones", async () => {
    const pool = await testPool();
    await pool.query(
      `INSERT INTO transactions (type, sender_account_id, receiver_account_id, amount, fee, reference, status)
       VALUES ('data', (SELECT id FROM accounts WHERE account_number = $1), NULL, 1000, 0, 'NVR-TEST-TYPE-01', 'success')`,
      [userAccount]
    );
    await pool.query("DELETE FROM transactions WHERE reference = 'NVR-TEST-TYPE-01'");
    await assert.rejects(
      pool.query(
        `INSERT INTO transactions (type, sender_account_id, receiver_account_id, amount, fee, reference, status)
         VALUES ('gift', (SELECT id FROM accounts WHERE account_number = $1), NULL, 100, 0, 'NVR-TEST-TYPE-02', 'success')`,
        [userAccount]
      ),
      /check/i
    );

    const user = await pool.query(
      "SELECT u.id FROM users u JOIN accounts a ON a.user_id = u.id WHERE a.account_number = $1",
      [userAccount]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, event_type, title, message, reference, destination, dedupe_key)
       VALUES ($1, 'airtime_purchased', 'Airtime sent', 'simulated test', 'NVR-TEST-N-01', '/history', 'airtime_purchased:NVR-TEST-N-01')`,
      [user.rows[0].id]
    );
    await pool.query("DELETE FROM notifications WHERE dedupe_key = 'airtime_purchased:NVR-TEST-N-01'");
    await assert.rejects(
      pool.query(
        `INSERT INTO notifications (user_id, event_type, title, message, dedupe_key)
         VALUES ($1, 'rocket_launched', 'x', 'y', 'zz-test')`,
        [user.rows[0].id]
      ),
      /check/i
    );

    const unread = await api(base, "GET", "/api/notifications/unread-count", { token: userToken });
    assert.equal(unread.status, 200);
    assert.ok(unread.data.data.unreadCount >= 1, "existing money-event notifications still recorded");
  });

  it("records migration 006, reruns cleanly, and preserves data", async () => {
    const pool = await testPool();
    const status = await getStatus(pool);
    assert.ok(status.applied.includes("006_topup"), "006_topup recorded as applied");
    assert.deepEqual(status.pending, []);

    const before = await pool.query("SELECT COUNT(*)::int AS n FROM transactions");
    const rerun = await runMigrations(pool);
    assert.deepEqual(rerun.newlyApplied, [], "rerun applies nothing");
    const after = await pool.query("SELECT COUNT(*)::int AS n FROM transactions");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});
