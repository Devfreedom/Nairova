// Auth persistence tests: registration, duplicate rejection, role safety,
// password login, admin bootstrap, authorization, and admin password reset.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown } = require("./setup");

describe("auth persistence", () => {
  let server;
  let base;
  let adminToken;

  before(async () => {
    await resetDb();
    await seedAdmin();
    server = await bootApp();
    base = baseUrl(server);
    const adminLogin = await login(base, "test.admin@example.com", "Admin123!");
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.data.token;
  });

  after(async () => {
    await teardown(server);
  });

  it("registration persists a user and account", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Alice Test", email: "alice.test@example.com", password: "Alice123!", pin: "1234", pinConfirm: "1234" },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.role, "user");
    assert.match(reg.data.data.accountNumber, /^\d{10}$/);
    assert.equal(reg.data.data.balance, 0);
    assert.equal(reg.data.data.pinSet, true);
    assert.ok(!("pin" in reg.data.data) && !("pinHash" in reg.data.data));

    const me = await api(base, "GET", "/api/auth/me", {
      token: (await login(base, "alice.test@example.com", "Alice123!")).data.token,
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.data.email, "alice.test@example.com");
    assert.equal(me.data.data.balance, 0);
    assert.ok(!("password" in me.data.data));
  });

  it("duplicate email registration is rejected", async () => {
    const again = await api(base, "POST", "/api/auth/register", {
      body: { name: "Alice Clone", email: "alice.test@example.com", password: "Alice123!", pin: "1234", pinConfirm: "1234" },
    });
    assert.equal(again.status, 409);
  });

  it("public registration cannot create an admin", async () => {
    const reg = await api(base, "POST", "/api/auth/register", {
      body: { name: "Mallory", email: "mallory@example.com", password: "Mallory1!", role: "admin", pin: "9999", pinConfirm: "9999" },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.data.role, "user");
  });

  it("wrong passwords are rejected", async () => {
    const bad = await login(base, "alice.test@example.com", "WrongPass1!");
    assert.equal(bad.status, 401);
  });

  it("unauthorized admin requests are rejected", async () => {
    const alice = await login(base, "alice.test@example.com", "Alice123!");
    const userList = await api(base, "GET", "/api/admin/users", { token: alice.data.token });
    assert.equal(userList.status, 403);
    const noToken = await api(base, "GET", "/api/account/balance");
    assert.equal(noToken.status, 401);
  });

  it("admin password reset works and preserves the account", async () => {
    const users = await api(base, "GET", "/api/admin/users", { token: adminToken });
    const alice = users.data.data.find((u) => u.email === "alice.test@example.com");
    assert.ok(alice);

    const reset = await api(base, "POST", "/api/admin/reset-password", {
      token: adminToken,
      body: { userId: alice.id, newPassword: "AliceNew1@", confirmPassword: "AliceNew1@" },
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.data.accountNumber, alice.accountNumber);

    const fresh = await login(base, "alice.test@example.com", "AliceNew1@");
    assert.equal(fresh.status, 200);
    const stale = await login(base, "alice.test@example.com", "Alice123!");
    assert.equal(stale.status, 401);
  });
});
