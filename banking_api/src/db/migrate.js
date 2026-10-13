// Versioned SQL migration runner.
// - Migrations live in src/db/migrations/*.sql, applied in filename order.
// - Applied versions are recorded in schema_migrations; reruns skip them.
// - Each migration runs in its own transaction; never drops tables or data.
//
// CLI: node src/db/migrate.js [migrate|status]
// Library use (tests): runMigrations(pool), getStatus(pool).
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { getPool, closePool } = require("./pool");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureHistoryTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function appliedVersions(client) {
  await ensureHistoryTable(client);
  const { rows } = await client.query("SELECT version FROM schema_migrations ORDER BY version");
  return new Set(rows.map((r) => r.version));
}

async function runMigrations(target) {
  const pool = target || getPool();
  const client = await pool.connect();
  try {
    // Serialize concurrent runners (tests, multi-instance deploys) so two
    // processes never apply the same migration at the same time.
    await client.query("SELECT pg_advisory_lock(918273645)");
    try {
      return await applyPending(client);
    } finally {
      await client.query("SELECT pg_advisory_unlock(918273645)");
    }
  } finally {
    client.release();
  }
}

async function applyPending(client) {
    const applied = await appliedVersions(client);
    const files = migrationFiles();
    const newlyApplied = [];
    for (const file of files) {
      const version = path.basename(file, ".sql");
      if (applied.has(version)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${version} failed: ${err.message}`);
      }
      newlyApplied.push(version);
    }
    return { applied: [...applied], newlyApplied };
}

async function getStatus(target) {
  const pool = target || getPool();
  const client = await pool.connect();
  try {
    const applied = await appliedVersions(client);
    const files = migrationFiles().map((f) => path.basename(f, ".sql"));
    return {
      files,
      applied: [...applied],
      pending: files.filter((v) => !applied.has(v)),
    };
  } finally {
    client.release();
  }
}

async function cli() {
  const command = process.argv[2] || "migrate";
  try {
    if (command === "status") {
      const s = await getStatus();
      console.log(`Applied migrations (${s.applied.length}): ${s.applied.join(", ") || "none"}`);
      console.log(`Pending migrations (${s.pending.length}): ${s.pending.join(", ") || "none"}`);
    } else if (command === "migrate") {
      const r = await runMigrations();
      if (r.newlyApplied.length === 0) {
        console.log("Database is up to date. No new migrations applied.");
      } else {
        console.log(`Applied migrations: ${r.newlyApplied.join(", ")}`);
      }
    } else {
      console.error(`Unknown command: ${command}. Use "migrate" or "status".`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("Migration error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  cli();
}

module.exports = { runMigrations, getStatus };
