# BankApp — Project Instructions for Coding Agents

## 1. Project goal

Build and polish a classroom banking application with a real frontend connected to the existing Express API. The required demo flow is: register a customer, log in, view the customer's account and balance, receive simulated funds from an authorized admin, transfer simulated funds to another registered account, and review transactions.

This is a **demo with simulated money only**. Do not integrate real payments, claim that deposits represent real funds, or present the application as production-ready banking software.

## 2. Workspace layout and repository safety

The intended local layout is:

```text
banking-app/
├── AGENTS.md
├── banking_api/  # Existing Node.js/Express API (renamed locally from backendLesson_4)
└── frontend/     # React frontend
```

Inspect the actual workspace before making changes; the layout above is based on the user's description and may differ locally.

- Preserve the existing backend and its working behavior wherever possible. Improve it incrementally instead of rewriting it without a clear reason.
- Check where `.git` actually lives. The backend folder may still be the Git repository root, meaning its sibling `frontend/` is outside that repository. **Do not move/delete `.git`, run `git init`, alter remotes, or restructure repository history without explicit approval.** Explain any version-control boundary you discover before proposing a structural change.
- Do not automatically commit, push, amend commits, or discard changes. Never overwrite unrelated local work.
- Inspect `git status`, the project tree, `package.json`, environment examples, app/server entry points, routes, controllers, and middleware before editing. Treat the current local files as authoritative if they differ from the public GitHub branch.

## 3. Working method

1. Inspect first. Identify what is already implemented, what is broken, and which API routes are actually mounted.
2. Write a short implementation plan before substantial edits.
3. Make focused, reviewable changes. Avoid large rewrites, unnecessary dependencies, duplicate middleware, or parallel implementations of existing functionality.
4. Keep backend business rules on the server. The frontend must never invent balances, approve a transfer locally, or bypass API authorization.
5. After each meaningful change, run the relevant checks and report exact outcomes. Do not claim a test/build passed unless it was run and passed.
6. When finished, summarize files changed, commands/tests run, known limitations, and the steps needed to run the app locally.

## 4. Backend baseline and existing API

The project uses Node.js, Express, CommonJS, JWT, bcrypt, and PostgreSQL via the official `pg` driver with parameterized queries. All users, accounts, balances, and transactions persist in PostgreSQL (`users`, `accounts`, `transactions` tables plus a `schema_migrations` history table). There is no in-memory fallback: the server refuses to start without `DATABASE_URL` and a fully migrated schema. Verify the local source before relying on these details.

The current public code includes these routes:

- `POST /api/auth/register` — customer registration.
- `POST /api/auth/login` — login and JWT response.
- `GET /api/auth/me` — authenticated user information.
- `GET /api/account/balance` — authenticated customer's balance.
- `POST /api/account/pin/create` — create transaction PIN.
- `PUT /api/account/pin/update` — update transaction PIN.
- `POST /api/account/deposit` — currently a simulated self-deposit; keep it clearly identified as demo functionality unless product requirements change.
- `POST /api/account/verify/:accountNumber` — intended recipient-account verification; inspect and repair its implementation before depending on it.
- `GET /api/account/users` — intended admin-only user listing; verify actual authorization behavior.
- `POST /api/transfer` — authenticated account transfer.

The public branch does not currently show a completed admin controller or an admin-credit route, nor a transaction-history route. Confirm this against the local files. Add only the missing endpoints needed for the agreed demo, following the existing architecture and consistent response/error formats.

### Backend corrections to verify and prioritize

- Verify the `start` and `dev` scripts against the real locations of `server.js` and `app.js`. The public `package.json` points at `src/server.js`, while the public branch shows `server.js` at the root; fix the mismatch if it remains locally.
- Public registration must not let the requester choose `role: "admin"`. Assign `user` by default. Provision an administrator through a documented server-controlled seed/bootstrap script or an explicit server-side allowlist. Never hardcode admin credentials into source code or the frontend.
- Remove any statement that logs `JWT_SECRET`, tokens, passwords, PINs, or other secrets. Fail safely when required secrets are missing; do not print their values.
- Repair recipient verification: use the actual route parameter, return a consistent response, avoid undefined variables, and always pass errors to the error handler.
- Validate all monetary amounts as finite numbers greater than zero, enforce a sensible maximum and supported decimal precision, reject malformed strings, and prevent JavaScript string concatenation from changing balances. Keep the API's existing amount format consistent unless changing it is necessary and documented. For new currency arithmetic, prefer integer minor units (kobo) or another precise monetary representation.
- Preserve transfer safeguards: authenticated sender, valid recipient, no transfers to self, correct transaction PIN, sufficient funds, and consistent balance updates and transaction records. Do not change balances until validation succeeds.
- Credit and transfer actions must be authorized by the backend and recorded. An admin-credit record should include the admin identity, recipient, amount, operation type, timestamp, and status.
- Ensure middleware and error handlers are ordered correctly; an earlier error handler must not accidentally prevent the shared handler from running.
- Never return password hashes, PIN hashes, JWT secrets, or internal stack traces to clients.
- Persistence is PostgreSQL. Records survive restarts. Never reintroduce an in-memory array as a source of truth, never silently fall back to one, and never claim old in-memory demo records were migrated — they were not. Schema changes go through versioned migrations in `src/db/migrations/` (applied with `npm run db:migrate`, inspected with `npm run db:status`); migrations must be ordered, reproducible, rerunnable, and non-destructive. Money arithmetic belongs in SQL (`NUMERIC(15,2)`); never compute persisted balances with JavaScript floats. Transfers and admin credits must run as single database transactions with row-level locking (`SELECT ... FOR UPDATE`, consistent lock order, conditional debit) so concurrent requests cannot overdraw an account.

## 5. Frontend requirements

Use **React + Vite + Tailwind CSS** unless the existing frontend has already adopted a working stack. Build inside `frontend/`; do not mix frontend source files into the backend's `src/` directory.

Create a polished, responsive, mobile-first banking interface with accessible forms, clear loading/error/success states, consistent spacing and typography, and useful empty states. Use Nigerian naira formatting (₦) for the classroom demo, while making it obvious that all funds are simulated.

Required customer experience:

- Registration and login forms with client-side usability validation plus server-side error display.
- Authenticated customer dashboard showing the name, account number, current API-provided balance, and recent activity.
- Logout and sensible handling of expired or invalid tokens.
- Create/update transaction PIN where supported by the backend.
- Transfer form that accepts a recipient account number and amount, verifies the recipient when the API supports it, requests the transaction PIN, and displays the actual API result.
- Transaction history sourced from the backend. If the endpoint is missing, implement it on the backend with ownership checks rather than fabricating history in the browser.
- An admin-only dashboard for viewing the available users and crediting an account with simulated test funds. Admin screens may be hidden from ordinary users for usability, but backend authorization remains mandatory.

### API integration rules

- Keep the API base URL configurable through a frontend environment variable such as `VITE_API_BASE_URL`; provide a safe `.env.example` containing placeholders only.
- Use a single, reusable API client for base URL, JSON headers, bearer-token attachment, response parsing, and consistent error handling.
- Match the API's actual response shapes. Do not assume endpoint responses return fields they do not provide.
- Never replace API calls with mock data just to make the UI appear functional. If a backend capability is missing, report it and implement the smallest coherent backend change needed.
- Do not hardcode tokens, credentials, balances, account numbers, or an admin password in source code.
- Because the current API uses bearer JWTs, use a consistent token lifecycle and never log tokens. If browser storage is used for this classroom app, prefer session-scoped storage and clear it on logout; explain the trade-off rather than claiming it is equivalent to secure HttpOnly cookies.
- Keep CORS configuration explicit and suitable for the configured frontend origin; do not use a permissive production configuration without explaining why.

## 6. Security and money-handling boundaries

- This is a learning/demo application using fake funds. Label demo credit/deposit actions accordingly in the UI.
- Do not integrate bank accounts, real card payments, real-money transfers, or third-party payment providers unless the user explicitly changes the requirements.
- Enforce roles and ownership on the server for every protected operation. Never trust a role supplied by the client or stored only in client state.
- Do not add backdoors, public admin-registration options, universal credentials, or hidden credit endpoints.
- Do not expose other customers' personal data to a normal user. The customer history endpoint must return only that customer's transactions.
- Do not log passwords, PINs, tokens, authorization headers, or full secret environment values.

## 7. Testing and acceptance criteria

Run the available scripts from the correct project directories. Backend automated tests run with `npm test` from `banking_api/` against the separate `TEST_DATABASE_URL` database (the runner refuses a missing or identical test database); frontend parser tests run with `npm run test:parser` from `frontend/`. Clearly distinguish automated tests from manual checks.

Before calling the demo ready, verify:

1. The backend starts using its documented command and the frontend starts using its documented command.
2. A new customer can register and log in; an ordinary registration request cannot grant admin privileges.
3. An unauthenticated request cannot read a protected balance or perform a transfer.
4. A customer can view their own correct balance and cannot access admin actions.
5. Invalid amounts, missing recipients, self-transfers, wrong PINs, and insufficient funds are rejected without changing balances.
6. A valid transfer debits the sender, credits the receiver, and creates matching transaction records.
7. Only an authorized admin can credit simulated funds, and the resulting balance change is recorded.
8. The customer can see their own transaction history; another customer cannot read it.
9. API errors are visible as helpful UI messages, forms prevent accidental duplicate submissions, and the displayed balance comes from the API.
10. The frontend production build completes successfully and there are no known blocking console or network errors in the main flow.

## 8. Environment and reporting

- Read `.env` only as needed; never reveal its contents. Keep real `.env` files untracked and use placeholders in examples.
- Document all required environment variable names without including real values. At minimum, check the JWT secret, `DATABASE_URL`/`TEST_DATABASE_URL`, and frontend API base URL against the actual implementation.
- Do not claim that the project is production-grade or safe for real money. Report remaining limitations.
- Do not commit or push unless the user explicitly requests it.
