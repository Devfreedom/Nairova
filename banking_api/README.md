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
| `PGSSL` | Empty for local dev and Render **Internal** URLs (private network, TLS not required); `true` for **External**/public-hosted URLs (TLS without CA verification); `verify` for full verification. When set, any `sslmode`/`sslcert`/`sslkey`/`sslrootcert` parameters in the URL are ignored in favor of this setting. |
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

## Deployment runbook (Vercel + Render + Render Postgres)

No live deployment is performed automatically; the steps below are manual dashboard
actions. Never put real credentials in tracked files — set them as dashboard
environment variables.

### 1. Database — Render Postgres

- Create a **Postgres** instance in the same region you plan for the web service.
- Copy the **Internal Database URL** (used by the Render web service).
- Migrations are applied explicitly, never during build:
  1. Deploy the backend code first (it will stay unhealthy until migrated — expected).
  2. Open the web service's **Shell** tab and run, from the `banking_api/` directory:
     ```bash
     npm run db:migrate
     npm run db:status
     ```
  3. Only `db:status` showing zero pending is acceptable before sending traffic.
- The migration runner is advisory-locked and rerunnable; it never drops data.
- Alternative for the very first deploy: run the same two commands from a laptop
  against the **External** URL with `PGSSL=true`
  (`DATABASE_URL='<external-url>' PGSSL=true npm run db:migrate` from `banking_api/`);
  allowlist your IP under the database's Access Control tab first.

### 2. Backend — Render Web Service

- **Root Directory:** `banking_api`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/health` (checks PostgreSQL reachability; 200 healthy, 503 on outage)
- Environment variables:
  | Variable | Value |
  |---|---|
  | `JWT_SECRET` | A newly generated long random secret (must differ from dev) |
  | `JWT_EXPIRES_IN` | `1h` |
  | `FRONTEND_ORIGIN` | `https://<your-app>.vercel.app` (exact Vercel URL, no trailing slash) |
  | `DATABASE_URL` | The Render **Internal Database URL** |
  | `PGSSL` | Leave empty (Render's private network does not require TLS for internal URLs; `true` also works but adds needless handshake overhead). Use `true` only with the **External** URL (e.g. migrations from a laptop). |
  | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Demo-admin bootstrap (created idempotently on boot) |
  (`PORT` is injected by Render; the server listens on `0.0.0.0`.)
- The server refuses to boot on missing `DATABASE_URL`, unreachable DB, or pending
  migrations, and shuts down gracefully (SIGTERM drains connections). No demo
  balances are seeded into production.

### 3. Frontend — Vercel

- New project from this repo, **Root Directory:** `frontend/`.
- `frontend/vercel.json` already rewrites all routes to `/index.html`, so direct
  navigation to `/login`, `/register`, `/transfer`, `/history`, and `/admin` works.
- Environment variable: `VITE_API_BASE_URL=https://<render-service>.onrender.com`
  (baked in at build time; localhost is only the local-dev fallback).
- After the Vercel URL is known, update the backend `FRONTEND_ORIGIN` to match and
  redeploy the backend; unknown origins remain rejected by CORS.

### 4. Post-deploy acceptance

1. Frontend loads over HTTPS; direct routes resolve (no 404s).
2. `GET /health` returns 200 with the database up, 503 on DB outage.
3. Register + login a new customer; ordinary signup cannot become admin.
4. Admin credit updates the balance with a ledger record.
5. Transfer between two accounts; restart/redeploy keeps balances and history.
6. Non-admin admin-API calls return 403; bad amounts/PINs/self-transfers rejected.
7. CORS allows only the configured Vercel origin.
