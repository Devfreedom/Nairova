// Shared PostgreSQL connection pool (official `pg` driver).
// Configuration comes only from environment variables; secrets are never logged.
const { Pool } = require("pg");

let pool = null;

function sslConfig() {
  const mode = (process.env.PGSSL || "").trim().toLowerCase();
  // "true"/"require": encrypted, provider cert not verified (common classroom default).
  if (mode === "true" || mode === "require") return { rejectUnauthorized: false };
  // "verify"/"verify-full": verify the server certificate chain.
  if (mode === "verify" || mode === "verify-full") return true;
  return undefined;
}

function createPool(connectionString) {
  if (!connectionString) {
    throw new Error(
      "Missing database configuration. Set DATABASE_URL to a PostgreSQL connection string."
    );
  }
  const p = new Pool({ connectionString, ssl: sslConfig() });
  // Never log connection strings, passwords, or query parameters here.
  p.on("error", (err) => {
    console.error("PostgreSQL pool error:", err && err.message ? err.message : err);
  });
  return p;
}

function getPool() {
  if (pool) return pool;
  pool = createPool(process.env.DATABASE_URL);
  return pool;
}

async function checkConnection(target) {
  const p = target || getPool();
  await p.query("SELECT 1");
}

async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { createPool, getPool, checkConnection, closePool };
