-- Migration 005: settings and account preferences (Phase 6).
-- Adds email-verification state, single-use verification tokens (hash-only),
-- and per-user preferences (in-app toggles, email opt-ins, appearance).
-- Preserves all existing data: new columns/tables only, backfills for
-- existing users, no rewrites of credentials, balances, or ledger rows.

-- Verification state. Existing addresses stay unverified: an address is never
-- marked verified merely because it was entered.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Single-use email verification tokens. Only the sha256 hash is stored;
-- the raw token is handed to the requester once and never persisted.
-- A token is bound to one user AND one address, expires after 15 minutes,
-- and is consumed on first successful use.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens (user_id);

-- Per-user preferences. In-app money-event notifications stay enabled by
-- default; email categories stay disabled until explicit opt-in with a
-- verified address. Appearance defaults to 'system' (follows the OS).
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  inapp_money_events BOOLEAN NOT NULL DEFAULT TRUE,
  email_money_events BOOLEAN NOT NULL DEFAULT FALSE,
  email_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill one preferences row per pre-existing user.
INSERT INTO user_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
