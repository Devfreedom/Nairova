-- Migration 003: ledger integrity for Phase 1b.
-- Adds a unique backend-generated transaction reference, optional narration,
-- and a recorded fee (default zero) to the existing transactions ledger.
-- Adds an idempotency_keys table so retries of balance-changing operations
-- can never execute a second debit or credit.
-- Preserves every existing row: backfills references for historical records
-- before enforcing NOT NULL / uniqueness. No data is dropped or rewritten.

-- New ledger columns (nullable first so existing rows survive the ALTER).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Fees are recorded, never negative. The agreed v1 transfer fee is zero.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_fee_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_fee_check CHECK (fee >= 0);

-- Backfill a deterministic unique reference for every historical row that
-- predates backend-generated references. Stable per row, so reruns change nothing.
UPDATE transactions
SET reference = 'NVR-HIST-' || id || '-' || substr(md5(id::text || '|' || created_at::text), 1, 8)
WHERE reference IS NULL;

-- Only now that no NULL remains, require and uniquify the reference.
ALTER TABLE transactions ALTER COLUMN reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_unique ON transactions (reference);

-- Idempotency registry. One row per intended financial operation, claimed
-- inside the same database transaction as the balance changes, so a retry
-- with the same key returns the original committed outcome instead of
-- executing again. Rows are retained indefinitely (no purge job); deleting
-- a key would silently allow an old request to execute a second time.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_user_created ON idempotency_keys (user_id, created_at DESC);
