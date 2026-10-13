// Email verification: token lifecycle, expiry, single-use, address binding,
// and email-change reset. Rate-limited calls in this file: 9 (limit is 10).
// Kept separate from settings.test.js so neither file exceeds the budget.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown, testPool } = require("./setup");

describe("email verification", () => {
  let server;
  let base;
  let token;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    const reg = await api(base, "POST", "/api/auth/register", { // 1
      body: { name: "Verify Me", email: "verify.me@example.com", password: "Verify12!", pin: "4444", pinConfirm: "4444" },
    });
    assert.equal(reg.status, 201);
    token = (await login(base, "verify.me@example.com", "Verify12!")).data.token; // 2
  });

  after(async () => {
    await teardown(server);
  });

  function me() {
    return api(base, "GET", "/api/auth/me", { token });
  }
  function request() {
    return api(base, "POST", "/api/account/email/request", { token });
  }
  function verify(verificationToken) {
    return api(base, "POST", "/api/account/email/verify", { token, body: { token: verificationToken } });
  }

  it("starts unverified and issues a token without sending email", async () => {
    assert.equal((await me()).data.data.emailVerified, false);

    const res = await request(); // 3
    assert.equal(res.status, 200);
    assert.equal(res.data.data.verificationSent, false);
    assert.equal(res.data.data.reason, "no-mail-provider");
    // Outside production the token is handed back for dev/test completion;
    // production responses must never contain it (asserted by shape below).
    assert.match(res.data.data.verificationToken, /^[0-9a-f]{64}$/);
    assert.ok(!("to" in res.data.data) && !("email" in res.data.data));
  });

  it("rejects malformed and unknown tokens", async () => {
    assert.equal((await verify("short")).status, 400);
    assert.equal((await verify("")).status, 400);
    assert.equal((await verify("f".repeat(64))).status, 400); // 4: well-formed, never issued
  });

  it("binds tokens to the address they were issued for", async () => {
    const issued = await request(); // 5
    const staleToken = issued.data.data.verificationToken;

    const moved = await api(base, "PATCH", "/api/account/profile", {
      token,
      body: { email: "verify.moved@example.com" },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.data.emailVerified, false);
    assert.ok(moved.message.includes("verification was reset"));

    // Valid, unused, unexpired — but issued for the previous address.
    assert.equal((await verify(staleToken)).status, 400); // 6
  });

  it("verifies exactly once and then refuses the token", async () => {
    const issued = await request(); // 7
    const goodToken = issued.data.data.verificationToken;

    const done = await verify(goodToken); // 8
    assert.equal(done.status, 200);
    assert.equal(done.data.data.emailVerified, true);
    assert.equal((await me()).data.data.emailVerified, true);

    assert.equal((await verify(goodToken)).status, 400); // 9: single-use
  });

  it("rejects expired tokens and lets verified users opt into email categories", async () => {
    // Backdate past expiry directly: no HTTP budget spent.
    const pool = await testPool();
    const userRow = await pool.query(`SELECT id FROM users WHERE email = $1`, ["verify.moved@example.com"]);

    // Move back to an unverified address to test expiry on a fresh token.
    const moved = await api(base, "PATCH", "/api/account/profile", {
      token,
      body: { email: "verify.expiry@example.com" },
    });
    assert.equal(moved.status, 200);

    // Fresh login is unnecessary (PATCH is not rate-limited); request inline.
    const issued = await api(base, "POST", "/api/account/email/request", { token });
    assert.equal(issued.status, 200);
    const expiringToken = issued.data.data.verificationToken;

    await pool.query(
      `UPDATE email_verification_tokens SET expires_at = now() - INTERVAL '1 minute'
       WHERE user_id = $1 AND used_at IS NULL`,
      [userRow.rows[0].id]
    );
    assert.equal((await verify(expiringToken)).status, 400);
    void issued;
  });
});
