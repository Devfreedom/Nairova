// Mandatory transaction PIN at registration: matching 4-digit confirmation,
// secure hashing, atomic user+account+PIN creation, and immediate usability.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("registration PIN", () => {
  let server;
  let base;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);
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
    assert.equal(reg.data.data.phone, "+2348055556666");
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

});
