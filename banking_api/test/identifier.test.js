// Email-or-phone authentication: normalization, phone register/login,
// duplicate handling, invalid input, and legacy email compatibility.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyIdentifier } = require("../src/utils/identifier");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("email-or-phone authentication", () => {
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

  it("normalizes identifiers consistently", () => {
    assert.deepEqual(classifyIdentifier("  ALICE@Example.COM "), {
      ok: true, kind: "email", value: "alice@example.com",
    });
    assert.deepEqual(classifyIdentifier("08012345678"), {
      ok: true, kind: "phone", value: "+2348012345678",
    });
    assert.deepEqual(classifyIdentifier("+2348012345678"), {
      ok: true, kind: "phone", value: "+2348012345678",
    });
    assert.deepEqual(classifyIdentifier("2348012345678"), {
      ok: true, kind: "phone", value: "+2348012345678",
    });
    assert.equal(classifyIdentifier("not-an-identifier").ok, false);
    assert.equal(classifyIdentifier("   ").ok, false);
  });

  it("existing email accounts keep working (legacy contract)", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Email User", email: "email.user@example.com", password: "Email123!", pin: "1357", pinConfirm: "1357" },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.email, "email.user@example.com");

    const legacy = await login(base, "email.user@example.com", "Email123!");
    assert.equal(legacy.status, 200);
    assert.ok(legacy.data.token);

    // New identifier field works for the same account.
    const viaIdentifier = await api(base, "POST", "/api/auth/login", {
      body: { identifier: "email.user@example.com", password: "Email123!" },
    });
    assert.equal(viaIdentifier.status, 200);
  });

  it("registers and logs in with a Nigerian phone number", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Phone User", identifier: "08012345678", password: "Phone123!", pin: "2468", pinConfirm: "2468" },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.phone, "+2348012345678");
    assert.equal(reg.data.data.email, null);
    assert.match(reg.data.data.accountNumber, /^\d{10}$/);

    let token = null;
    for (const spelling of ["08012345678", "2348012345678"]) {
      const res = await api(base, "POST", "/api/auth/login", {
        body: { identifier: spelling, password: "Phone123!" },
      });
      assert.equal(res.status, 200, `login failed for ${spelling}`);
      token = res.data.token;
    }
    const me = await api(base, "GET", "/api/auth/me", { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.data.phone, "+2348012345678");
  });

  it("rejects duplicate phone numbers gracefully", async () => {
    const again = await api(base, "POST", "/api/auth/register", {
      body: { name: "Phone Clone", identifier: "+2348012345678", password: "Phone123!", pin: "2468", pinConfirm: "2468" },
    });
    assert.equal(again.status, 409);
  });

  it("rejects malformed identifiers and wrong passwords", async () => {
    const badReg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Bad", identifier: "12345", password: "Bad123!!", pin: "0000", pinConfirm: "0000" },
    });
    assert.equal(badReg.status, 400);

    const badLogin = await api(base, "POST", "/api/auth/login", {
      body: { identifier: "08012345678", password: "WrongPass1!" },
    });
    assert.equal(badLogin.status, 401);
  });

  it("public phone registration cannot create an admin", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Sneaky", identifier: "08099998888", password: "Sneaky123!", role: "admin", pin: "1122", pinConfirm: "1122" },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.role, "user");
  });
});
