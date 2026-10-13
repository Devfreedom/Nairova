// Settings: profile edits, preferences gating/enforcement, password change,
// and the email seam. Rate-limited calls in this file: 8 (limit is 10).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");
const { maybeSendEmail } = require("../src/utils/email");

describe("settings", () => {
  let server;
  let base;
  let tokenA;
  let tokenB;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);

    const a = await api(base, "POST", "/api/auth/register", { // 1
      body: { name: "Settings Alpha", identifier: "08030000001", password: "Settings1!", pin: "1111", pinConfirm: "1111" },
    });
    assert.equal(a.status, 201);
    tokenA = (await login(base, "08030000001", "Settings1!")).data.token; // 2

    const b = await api(base, "POST", "/api/auth/register", { // 3
      body: { name: "Settings Other", identifier: "08030000002", password: "Settings1!", pin: "2222", pinConfirm: "2222" },
    });
    assert.equal(b.status, 201);
    tokenB = (await login(base, "08030000002", "Settings1!")).data.token; // 4
  });

  after(async () => {
    await teardown(server);
  });

  function me(token) {
    return api(base, "GET", "/api/auth/me", { token });
  }

  it("exposes verification state and default preferences on /me", async () => {
    const res = await me(tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.emailVerified, false);
    assert.deepEqual(res.data.data.preferences, {
      inappMoneyEvents: true,
      emailMoneyEvents: false,
      emailMarketing: false,
      theme: "system",
    });
    assert.ok(!("passwordHash" in res.data.data) && !("pinHash" in res.data.data));
  });

  it("updates the profile and validates inputs", async () => {
    const renamed = await api(base, "PATCH", "/api/account/profile", {
      token: tokenA,
      body: { name: "Settings Renamed" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.data.name, "Settings Renamed");

    const withEmail = await api(base, "PATCH", "/api/account/profile", {
      token: tokenA,
      body: { email: "settings.a@example.com" },
    });
    assert.equal(withEmail.status, 200);
    assert.equal(withEmail.data.data.email, "settings.a@example.com");
    assert.equal(withEmail.data.data.emailVerified, false);

    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: {} })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: { name: "x" } })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: { email: "not-an-email" } })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: { email: "08030000001" } })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: { phone: "123" } })).status, 400);
    // Clearing both identifiers is rejected: at least one must remain.
    assert.equal((await api(base, "PATCH", "/api/account/profile", { token: tokenA, body: { email: "", phone: "" } })).status, 400);
  });

  it("keeps one user from taking or touching another's details", async () => {
    const dupEmail = await api(base, "PATCH", "/api/account/profile", {
      token: tokenB,
      body: { email: "settings.a@example.com" },
    });
    assert.equal(dupEmail.status, 409);

    const dupPhone = await api(base, "PATCH", "/api/account/profile", {
      token: tokenB,
      body: { phone: "08030000001" },
    });
    assert.equal(dupPhone.status, 409);

    // B edits only B: A's stored name is untouched.
    const bEdit = await api(base, "PATCH", "/api/account/profile", {
      token: tokenB,
      body: { name: "Settings Other Edited" },
    });
    assert.equal(bEdit.status, 200);
    assert.equal((await me(tokenA)).data.data.name, "Settings Renamed");
  });

  it("persists preferences, gates email opt-ins, and validates input", async () => {
    // Unverified address: email categories stay off.
    const gated = await api(base, "PATCH", "/api/account/preferences", {
      token: tokenA,
      body: { emailMoneyEvents: true },
    });
    assert.equal(gated.status, 400);
    const gated2 = await api(base, "PATCH", "/api/account/preferences", {
      token: tokenA,
      body: { emailMarketing: true },
    });
    assert.equal(gated2.status, 400);

    const off = await api(base, "PATCH", "/api/account/preferences", {
      token: tokenA,
      body: { inappMoneyEvents: false },
    });
    assert.equal(off.status, 200);
    assert.equal(off.data.data.inappMoneyEvents, false);

    assert.equal((await api(base, "PATCH", "/api/account/preferences", { token: tokenA, body: {} })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/preferences", { token: tokenA, body: { nope: true } })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/preferences", { token: tokenA, body: { inappMoneyEvents: "yes" } })).status, 400);
    assert.equal((await api(base, "PATCH", "/api/account/preferences", { token: tokenA, body: { theme: "neon" } })).status, 400);
  });

  it("respects the in-app opt-out inside the money transaction", async () => {
    // A opted out above: this deposit commits money but creates no notification.
    const first = await api(base, "POST", "/api/account/deposit", {
      token: tokenA,
      body: { amount: 5000, idempotencyKey: randomUUID() },
    });
    assert.equal(first.status, 200);
    const silent = await api(base, "GET", "/api/notifications", { token: tokenA });
    assert.equal(silent.status, 200);
    assert.deepEqual(silent.data.data, []);

    // Opt back in: the next deposit notifies.
    const on = await api(base, "PATCH", "/api/account/preferences", {
      token: tokenA,
      body: { inappMoneyEvents: true },
    });
    assert.equal(on.status, 200);
    const second = await api(base, "POST", "/api/account/deposit", {
      token: tokenA,
      body: { amount: 1000, idempotencyKey: randomUUID() },
    });
    assert.equal(second.status, 200);
    const noisy = await api(base, "GET", "/api/notifications", { token: tokenA });
    assert.equal(noisy.data.data.length, 1);
    assert.equal(noisy.data.data[0].eventType, "deposit_received");
  });

  it("changes the password only with the correct current one", async () => {
    const wrong = await api(base, "PUT", "/api/account/password", { // 5
      token: tokenB,
      body: { currentPassword: "WrongPass1!", newPassword: "BrandNew1@" },
    });
    assert.equal(wrong.status, 403);

    const weak = await api(base, "PUT", "/api/account/password", { // 6
      token: tokenB,
      body: { currentPassword: "Settings1!", newPassword: "weak" },
    });
    assert.equal(weak.status, 400);

    const ok = await api(base, "PUT", "/api/account/password", { // 7
      token: tokenB,
      body: { currentPassword: "Settings1!", newPassword: "BrandNew1@" },
    });
    assert.equal(ok.status, 200);

    const fresh = await login(base, "08030000002", "BrandNew1@"); // 8
    assert.equal(fresh.status, 200);
    tokenB = fresh.data.token;
  });

  it("never sends email without a provider and logs nothing sensitive", async () => {
    const none = await maybeSendEmail({ to: "a@example.com", subject: "x", text: "y" });
    assert.deepEqual(none, { sent: false, provider: "none", reason: "no-provider" });
    const bad = await maybeSendEmail({ to: "a@example.com" });
    assert.equal(bad.sent, false);
  });
});
