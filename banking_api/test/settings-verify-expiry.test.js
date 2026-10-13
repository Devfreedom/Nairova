// Email verification edge cases: address binding, email-change reset, and
// expiry. Rate-limited calls in this file: 6 (limit is 10). Kept separate
// from settings-verify.test.js so neither file exceeds the auth budget.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown, testPool } = require("./setup");

describe("email verification binding and expiry", () => {
  let server;
  let base;
  let token;
  let userId;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    const reg = await api(base, "POST", "/api/auth/register", { // 1
      body: { name: "Verify Edge", email: "verify.edge@example.com", password: "Verify12!", pin: "5555", pinConfirm: "5555" },
    });
    assert.equal(reg.status, 201);
    userId = reg.data.data.id;
    token = (await login(base, "verify.edge@example.com", "Verify12!")).data.token; // 2
  });

  after(async () => {
    await teardown(server);
  });

  function verify(verificationToken) {
    return api(base, "POST", "/api/account/email/verify", { token, body: { token: verificationToken } });
  }

  it("resets verification on email change and binds tokens to one address", async () => {
    const issued = await api(base, "POST", "/api/account/email/request", { token }); // 3
    assert.equal(issued.status, 200);
    const staleToken = issued.data.data.verificationToken;

    const moved = await api(base, "PATCH", "/api/account/profile", {
      token,
      body: { email: "verify.edge.moved@example.com" },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.data.emailVerified, false);
    assert.ok(moved.data.message.includes("verification was reset"));

    // Valid, unused, unexpired — but issued for the previous address.
    assert.equal((await verify(staleToken)).status, 400); // 4
  });

  it("rejects expired tokens", async () => {
    const issued = await api(base, "POST", "/api/account/email/request", { token }); // 5
    assert.equal(issued.status, 200);
    const expiringToken = issued.data.data.verificationToken;

    // Backdate past expiry directly: no rate-limit budget spent.
    const pool = await testPool();
    const updated = await pool.query(
      `UPDATE email_verification_tokens SET expires_at = now() - INTERVAL '1 minute'
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    assert.equal(updated.rowCount, 1);

    assert.equal((await verify(expiringToken)).status, 400); // 6
  });
});
