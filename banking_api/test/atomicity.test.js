// Atomicity tests: concurrent transfers cannot overspend, failures roll back
// fully, and records survive a fresh pool (reconnect) cycle.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown, freshPool } = require("./setup");
const { closePool, getPool } = require("../src/db/pool");

describe("transfer atomicity", () => {
  let server;
  let base;
  let adminToken;
  let aliceToken;
  let aliceAccount;
  let bobAccount;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    await api(base, "POST", "/api/auth/register", {
      body: { name: "Alice Race", email: "alice.race@example.com", password: "Alice123!" },
    });
    await api(base, "POST", "/api/auth/register", {
      body: { name: "Bob Race", email: "bob.race@example.com", password: "Bob12345!" },
    });

    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token;
    aliceToken = (await login(base, "alice.race@example.com", "Alice123!")).data.token;

    aliceAccount = (await api(base, "GET", "/api/auth/me", { token: aliceToken })).data.data.accountNumber;
    const bobToken = (await login(base, "bob.race@example.com", "Bob12345!")).data.token;
    bobAccount = (await api(base, "GET", "/api/auth/me", { token: bobToken })).data.data.accountNumber;

    await api(base, "POST", "/api/account/pin/create", { token: aliceToken, body: { pin: "1234" } });
    await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: aliceAccount, amount: 1000 },
    });
  });

  after(async () => {
    await teardown(server);
  });

  async function balance(token) {
    return (await api(base, "GET", "/api/account/balance", { token })).data.balance;
  }

  async function accountIdByEmail(email) {
    const p = await testPool();
    const { rows } = await p.query(
      `SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
      [email]
    );
    return rows[0].id;
  }

  async function transferCount() {
    const senderAccountId = await accountIdByEmail("alice.race@example.com");
    const p = await testPool();
    const { rows } = await p.query(
      "SELECT COUNT(*)::int AS n FROM transactions WHERE type = 'transfer' AND sender_account_id = $1",
      [senderAccountId]
    );
    return rows[0].n;
  }

  it("simultaneous transfers cannot overspend the account", async () => {
    // Balance is 1000; five concurrent transfers of 300 must yield at most
    // three successes and never a negative balance.
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        api(base, "POST", "/api/transfer", {
          token: aliceToken,
          body: { receiverAccountNumber: bobAccount, amount: 300, pin: "1234" },
        })
      )
    );
    const successes = attempts.filter(
      (a) => a.status === "fulfilled" && a.value.status === 200
    ).length;
    assert.equal(successes, 3);
    assert.equal(await balance(aliceToken), 100);
    assert.equal(await transferCount(), 3);
  });

  it("failed transfers roll back balances and ledger inserts", async () => {
    const beforeBalance = await balance(aliceToken);
    const beforeCount = await transferCount();
    const res = await api(base, "POST", "/api/transfer", {
      token: aliceToken,
      body: { receiverAccountNumber: bobAccount, amount: 5000, pin: "1234" },
    });
    assert.equal(res.status, 400);
    assert.equal(await balance(aliceToken), beforeBalance);
    assert.equal(await transferCount(), beforeCount);
  });

  it("records survive a fresh pool reconnect", async () => {
    const expectedBalance = await balance(aliceToken);
    const expectedCount = await transferCount();
    await closePool();
    const fresh = freshPool();
    try {
      const { rows } = await fresh.query(
        `SELECT a.balance FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
        ["alice.race@example.com"]
      );
      assert.equal(Number(rows[0].balance), expectedBalance);
      const counted = await fresh.query(
        "SELECT COUNT(*)::int AS n FROM transactions WHERE type = 'transfer' AND sender_account_id = $1",
        [await accountIdByEmail("alice.race@example.com")]
      );
      assert.equal(counted.rows[0].n, expectedCount);
    } finally {
      await fresh.end();
    }
    // Re-establish the singleton pool for teardown.
    getPool();
  });
});
