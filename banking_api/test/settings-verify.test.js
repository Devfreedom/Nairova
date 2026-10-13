// Email verification lifecycle: issuance, shape validation, single-use
// consumption, and verified email-category opt-in.
// Rate-limited calls in this file: 7 (limit is 10).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

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
    // it must never appear in production responses.
    assert.match(res.data.data.verificationToken, /^[0-9a-f]{64}$/);
    assert.ok(!("to" in res.data.data) && !("email" in res.data.data));
  });

  it("rejects malformed and unknown tokens", async () => {
    assert.equal((await verify("short")).status, 400); // 4
    assert.equal((await verify("f".repeat(64))).status, 400); // 5: well-formed, never issued
  });

  it("verifies exactly once, then unlocks email opt-ins", async () => {
    const issued = await request(); // 6
    const goodToken = issued.data.data.verificationToken;

    const done = await verify(goodToken); // 7
    assert.equal(done.status, 200);
    assert.equal(done.data.data.emailVerified, true);
    assert.equal((await me()).data.data.emailVerified, true);

    assert.equal((await verify(goodToken)).status, 400); // reuse is single-use

    // Verified address: email categories can now be enabled.
    const prefs = await api(base, "PATCH", "/api/account/preferences", {
      token,
      body: { emailMoneyEvents: true, emailMarketing: true },
    });
    assert.equal(prefs.status, 200);
    assert.equal(prefs.data.data.emailMoneyEvents, true);
    assert.equal(prefs.data.data.emailMarketing, true);
  });
});
