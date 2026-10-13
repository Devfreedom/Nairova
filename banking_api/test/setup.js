// Shared test setup. Each test file runs in its own process (node --test),
// so overriding DATABASE_URL here only affects that file's app instance.
//
// Safety: destructive setup refuses to run unless TEST_DATABASE_URL is set
// and differs from DATABASE_URL. The development database is never touched.
require("dotenv").config();
const bcrypt = require("bcrypt");
const { createPool, closePool } = require("../src/db/pool");
const { runMigrations } = require("../src/db/migrate");
const { bootstrapAdminRecord } = require("../src/db/store");

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;

if (!TEST_URL) {
  throw new Error("Refusing to run tests: TEST_DATABASE_URL is not set.");
}
if (TEST_URL === APP_URL) {
  throw new Error("Refusing to run tests: TEST_DATABASE_URL must differ from DATABASE_URL.");
}

// Point the app singleton at the test database for this process.
process.env.DATABASE_URL = TEST_URL;

let pool = null;
async function testPool() {
  if (!pool) {
    pool = createPool(TEST_URL);
    await runMigrations(pool);
  }
  return pool;
}

async function resetDb() {
  const p = await testPool();
  await p.query("TRUNCATE transactions, accounts, users RESTART IDENTITY CASCADE");
}

async function seedAdmin() {
  await testPool();
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const result = await bootstrapAdminRecord({
    name: "Test Admin",
    email: "test.admin@example.com",
    passwordHash,
  });
  return result.user;
}

function bootApp() {
  const app = require("../app");
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function api(base, method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  return { status: res.status, data };
}

async function login(base, email, password) {
  const res = await api(base, "POST", "/api/auth/login", { body: { email, password } });
  return res;
}

async function teardown(server) {
  await new Promise((resolve) => server.close(resolve));
  if (pool) {
    await pool.end();
    pool = null;
  }
  await closePool();
}

module.exports = { testPool, resetDb, seedAdmin, bootApp, baseUrl, api, login, teardown };
