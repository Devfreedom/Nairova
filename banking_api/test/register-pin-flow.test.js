// Registration-PIN end-to-end flow: a newly registered user can fund and
// transfer immediately with the PIN chosen at signup.
// Kept in a separate file from register-pin.test.js so neither file exceeds
// the auth rate-limit budget (10 register/login requests per 15 minutes).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("registration PIN flow", () => {
  let server;
  let base;
  let adminToken;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);
    adminToken = (await login(base, "test.admin@example.com", "Admin123!")).data.token;
  });

  after(async () => {
    await teardown(server);
  });

  it("lets a newly registered user transfer immediately with the chosen PIN", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Spender New", identifier: "08010000008", password: "Spender1!",
        pin: "6060", pinConfirm: "6060",
      },
    });
    assert.equal(reg.status, 201);
    const sender = reg.data.data.accountNumber;

    const receiver = await api(base, "POST", "/api/auth/register", {
      body: {
        name: "Receiver New", identifier: "08010000009", password: "Receiver1!",
        pin: "7070", pinConfirm: "7070",
      },
    });
    assert.equal(receiver.status, 201);

    const credit = await api(base, "POST", "/api/admin/credit", {
      token: adminToken,
      body: { accountNumber: sender, amount: 5000 },
    });
    assert.equal(credit.status, 200);

    const senderToken = (await login(base, "08010000008", "Spender1!")).data.token;
    const moved = await api(base, "POST", "/api/transfer", {
      token: senderToken,
      body: { receiverAccountNumber: receiver.data.data.accountNumber, amount: 1500, pin: "6060" },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.newBalance, 3500);
    assert.ok(moved.data.reference);
  });
});
