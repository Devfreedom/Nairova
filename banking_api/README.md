# banking_api — Classroom Banking API (PostgreSQL-backed)

Express API for the BankApp classroom demo. **All funds are simulated; no real money moves here.**

## Storage

All users, accounts, balances, and transactions live in **PostgreSQL**. There is no
in-memory fallback: the server refuses to start without `DATABASE_URL` and a fully
migrated schema. Previous in-memory demo records are **not** migrated automatically —
register fresh demo accounts after switching databases.

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL 14+ database reachable via `DATABASE_URL` (local server or a hosted
  PostgreSQL-compatible service)

### Create databases (local PostgreSQL example)

```bash
createdb bankapp
createdb bankapp_test
```

Any PostgreSQL provider works as long as you get a connection string of the form
`postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.

## Configure the environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Purpose |
|---|---|
| `PORT` | API listen port (default 5000) |
| `JWT_SECRET` | Long random secret for signing tokens (required) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1h` |
| `FRONTEND_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `DATABASE_URL` | Application database connection string (**required**) |
| `PGSSL` | Empty for local dev; `true` or `verify` for hosted providers |
| `TEST_DATABASE_URL` | Separate test database (**required for tests**, must differ from `DATABASE_URL`) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Server-controlled demo-admin bootstrap |

Never commit `.env`. It is already covered by `.gitignore`.

## Run database migrations

```bash
npm run db:migrate   # apply pending migrations (safe to re-run)
npm run db:status    # show applied vs pending migrations
```

Migrations are ordered, recorded in `schema_migrations`, and guarded by an advisory
lock so concurrent runners cannot apply the same migration twice. They never drop
tables or erase records.

## Create the initial admin

Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` (and optional `ADMIN_NAME`) in `.env`, then start
the server — the admin is created idempotently on boot. If the configured email
already belongs to an ordinary user, it is **not** promoted; the server logs a
warning. Resolve by changing `ADMIN_EMAIL` or promoting the row explicitly:

```sql
UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';
```

## Start the backend and frontend

```bash
# backend (from banking_api/)
npm install
npm run db:migrate
npm run dev        # or: npm start

# frontend (from frontend/)
npm install
npm run dev
```

The frontend reads the API base URL from `VITE_API_BASE_URL` (see `frontend/.env.example`).

## Verify persistence and run tests

```bash
npm test           # backend suite (uses TEST_DATABASE_URL only)
```

The suite covers registration persistence, duplicate rejection, role safety, login,
admin bootstrap, authorization, admin credit, transfers, rejection cases, history
scoping, concurrent-transfer safety, rollback, and reconnect persistence. The runner
refuses to start if `TEST_DATABASE_URL` is missing or equals `DATABASE_URL`.

Manual persistence check: register a user, credit the account, restart the backend
process, then log in again — the balance and history must be unchanged.

Frontend checks: `npm run lint` and `npm run build` from `frontend/`.
