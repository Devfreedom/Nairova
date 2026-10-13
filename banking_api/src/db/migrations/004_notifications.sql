-- Migration 004: persistent in-app notification centre (Phase 5).
-- One row per user-visible money event. Rows are written inside the same
-- database transaction as the ledger insert they describe, so a notification
-- can never exist for a rolled-back operation. A per-owner dedupe key plus
-- a unique constraint backstops idempotent retries against double inserts.
-- Preserves all existing data: brand-new table, no ALTERs to other tables.

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'transfer_sent', 'transfer_received', 'deposit_received', 'admin_credit_received'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  -- Ledger reference for display/correlation only. Intentionally not a foreign
  -- key: notifications must survive independently of ledger retention choices.
  reference TEXT,
  -- Only allowlisted internal destinations; the client maps these to routes
  -- and must never navigate anywhere else from a notification.
  destination TEXT CHECK (destination IN ('/', '/transfer', '/history')),
  -- Stable per event, e.g. 'transfer_received:NVR-20250101-abc123'.
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CONSTRAINT notifications_owner_dedupe UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC, id DESC);
-- Fast unread counts and unread-first reads without scanning read history.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read_at IS NULL;
