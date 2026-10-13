// Mandatory transaction PIN at registration: matching 4-digit confirmation,
// secure hashing, atomic user+account+PIN creation, and immediate usability.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("registration PIN", () => {
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

  function register(body) {
    return api(base, "POST", "/api/auth/register", { body });
  }

  it("registers a phone-only account with a confirmed PIN", async () => {
    const reg = await register({
      name: "Pin User", identifier: "08055556666", password: "Pinuser1!", pin: "4821", pinConfirm: "4821",
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.phone, "+23455556666");
    assert.equal(reg.data.data.pinSet, true);
    assert.ok(!("pin" in reg.data.data) && !("pinHash" in reg.data.data));
    assert.ok(!JSON.stringify(reg.data).includes("4821"), "raw PIN must never appear in the response");
  });

  it("registers an email account with a confirmed PIN", async () => {
    const reg = await register({
      name: "Email Pin", email: "email.pin@example.com", password: "Emailpin1!", pin: "7392", pinConfirm: "7392",
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.pinSet, true);
  });

  it("rejects missing, malformed, or mismatched PINs", async () => {
    const cases = [
      { name: "No Pin", identifier: "08010000001", password: "Nopin123!" },
      { name: "No Confirm", identifier: "08010000002", password: "Nopin123!", pin: "1111" },
      { name: "Mismatch", identifier: "08010000003", password: "Nopin123!", pin: "1111", pinConfirm: "2222" },
      { name: "Short", identifier: "08010000004", password: "Nopin123!", pin: "123", pinConfirm: "123" },
      { name: "Long", identifier: "08010000005", password: "Nopin123!", pin: "12345", pinConfirm: "12345" },
      { name: "Alpha", identifier: "08010000006", password: "Nopin123!", pin: "12a4", pinConfirm: "12a4" },
    ];
    for (const body of cases) {
      const res = await register(body);
      assert.equal(res.status, 400, `${body.name} should be rejected`);
    }
  });

  it("creates no partial user when PIN confirmation fails", async () => {
    const bad = await register({
      name: "Half User", identifier: "08010000007", password: "Halfuser1!", pin: "1111", pinConfirm: "9999",
    });
    assert.equal(bad.status, 400);

    // The identifier must still be free: nothing was persisted.
    const good = await register({
      name: "Half User", identifier: "08010000007", password: "Halfuser1!", pin: "1111", pinConfirm: "1111",
    });
    assert.equal(good.status, 201);
    const me = await api(base, "GET", "/api/auth/me", {
      token: (await login(base, "08010000007", "Halfuser1!")).data.token,
    });
    assert.equal(me.status, 200);
  });

  it("lets a newly registered user transfer immediately with the chosen PIN", async () => {
    const reg = await register({
      name: "Spender New", identifier: "08010000008", password: "Spender1!", pin: "6060", pinConfirm: "6060",
    });
    assert.equal(reg.status, 201);
    const sender = reg.data.data.accountNumber;

    const receiver = await register({
      name: "Receiver New", identifier: "08010000009", password: "Receiver1!", pin: "7070", pinConfirm: "7070",
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
  });
});
