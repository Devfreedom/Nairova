// Money movement tests: PIN setup, admin credit, transfers, rejections,
// history scoping, and balance integrity on failure.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("money movement", () => {
  let server;
  let base;
  let adminToken;
  let aliceToken;
  let bobToken;
  let aliceAccount;
  let bobAccount;
  let bobId;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    await api(base, "POST", "/api/auth/register", {
      body: { name: "Alice Money", email: "alice.money@example.com", password: "Alice123!" },
    });
    await api(base, "POST", "/api/auth/register", {
      body: { name: "Bob Money", email: "bob.money@example.com", password: "Bob12345!" },
    });

    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token;
    aliceToken = (await login(base, "alice.money@example.com", "Alice123!")).data.token;
    bobToken = (await login(base, "bob.money@example.com", "Bob12345!")).data.token;

    aliceAccount = (await api(base, "GET", "/api/auth/me", { token: aliceToken })).data.data.accountNumber;
    const bobMe = (await api(base, "GET", "/api/auth/me", { token: bobToken })).data.data;
    bobAccount = bobMe.accountNumber;
    bobId = bobMe.id;

    await api(base, "POST", "/api/account/pin/create", { token: aliceToken, body: { pin: "1234" } });
    await api(base, "POST", "/api/account/pin/create", { token: bobToken, body: { pin: "5678" } });
  });

  after(async () => {
    await teardown(server);
  });

  async function balance(token) {
    return (await api(base, "GET", "/api/account/balance", { token })).data.balance;
  }

  it("admin credit updates the balance and records the transaction", async () => {
    const credit = await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: aliceAccount, amount: 5000 },
    });
    assert.equal(credit.status, 200);
    assert.equal(credit.data.data.newBalance, 5000);
    assert.equal(credit.data.data.transaction.type, "admin_credit");
    assert.equal(await balance(aliceToken), 5000);
  });

  it("ordinary users cannot use the admin credit endpoint", async () => {
    const res = await api(base, "POST", "/api/admin/credit", {
      token: aliceToken,
      body: { accountNumber: bobAccount, amount: 10 },
    });
    assert.equal(res.status, 403);
  });

  it("valid transfers debit and credit the correct accounts", async () => {
    const res = await api(base, "POST", "/api/transfer", {
      token: aliceToken,
      body: { receiverAccountNumber: bobAccount, amount: 1000, pin: "1234" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.newBalance, 4000);
    assert.equal(await balance(aliceToken), 4000);
    assert.equal(await balance(bobToken), 1000);
  });

  it("wrong PIN, self-transfer, bad amounts, and insufficient funds change nothing", async () => {
    const beforeAlice = await balance(aliceToken);
    const beforeBob = await balance(bobToken);

    const cases = [
      { receiverAccountNumber: bobAccount, amount: 10, pin: "0000" }, // wrong PIN
      { receiverAccountNumber: aliceAccount, amount: 10, pin: "1234" }, // self
      { receiverAccountNumber: bobAccount, amount: -5, pin: "1234" }, // negative
      { receiverAccountNumber: bobAccount, amount: "abc", pin: "1234" }, // malformed
      { receiverAccountNumber: bobAccount, amount: 99999999, pin: "1234" }, // insufficient
      { receiverAccountNumber: "0000000000", amount: 10, pin: "1234" }, // missing account
    ];
    for (const body of cases) {
      const res = await api(base, "POST", "/api/transfer", { token: aliceToken, body });
      assert.ok(res.status >= 400, `expected rejection, got ${res.status}`);
    }

    assert.equal(await balance(aliceToken), beforeAlice);
    assert.equal(await balance(bobToken), beforeBob);
  });

  it("transaction history is restricted to the customer's own records", async () => {
    const aliceTx = await api(base, "GET", "/api/account/transactions", { token: aliceToken });
    const bobTx = await api(base, "GET", "/api/account/transactions", { token: bobToken });
    assert.ok(aliceTx.data.data.length >= 2);
    for (const t of bobTx.data.data) {
      assert.ok(t.senderId === bobId || t.receiverId === bobId);
    }
    const adminTx = await api(base, "GET", "/api/admin/transactions", { token: adminToken });
    assert.ok(adminTx.data.data.length >= aliceTx.data.data.length);
  });

  it("PIN update works with the correct old PIN", async () => {
    const res = await api(base, "PUT", "/api/account/pin/update", {
      token: bobToken,
      body: { oldPin: "5678", newPin: "8765" },
    });
    assert.equal(res.status, 200);
  });
});
