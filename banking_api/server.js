require("dotenv").config();
const app = require("./app");
const { getPool, checkConnection, closePool } = require("./src/db/pool");
const { getStatus } = require("./src/db/migrate");
const { bootstrapAdmin } = require("./src/config/bootstrapAdmin");

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error("Missing required environment variable: JWT_SECRET. Server cannot start safely.");
  process.exit(1);
}

async function ensureDatabaseReady() {
  // Fails clearly when DATABASE_URL is missing or the database is unreachable.
  // There is no in-memory fallback.
  getPool();
  try {
    await checkConnection();
  } catch (err) {
    throw new Error(
      `Cannot connect to PostgreSQL. Check DATABASE_URL and that the database is running. (${err.message || err})`
    );
  }
  let status;
  try {
    status = await getStatus();
  } catch (err) {
    throw new Error(
      `Cannot read migration history. The database may not be migrated. Run: npm run db:migrate (${err.message || err})`
    );
  }
  if (status.pending.length > 0) {
    throw new Error(
      `Database schema is outdated. Pending migrations: ${status.pending.join(", ")}. Run: npm run db:migrate`
    );
  }
}

async function start() {
  try {
    await ensureDatabaseReady();
    await bootstrapAdmin();
  } catch (err) {
    console.error("Startup failed:", err.message || err);
    process.exit(1);
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();
