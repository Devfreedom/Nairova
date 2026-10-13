-- Migration 006: simulated airtime/data foundation (Phase 3, Stage 1).
-- Widens the transaction and notification type allowlists for future
-- purchase operations, permits ledger rows without a receiving account
-- (purchases debit the buyer; no telecom counterparty account exists),
-- and adds a purchases detail table linked 1:1 to the authoritative
-- transactions ledger. No money movement, no purchase execution.
-- Preserves every existing row: only allowlists grow, nullability relaxes,
-- and the new table starts empty. No data is dropped or rewritten.
-- Actual constraint names verified against the live schema before writing:
-- transactions_type_check, notifications_event_type_check.

-- Allow the future purchase ledger types alongside every existing type.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'admin_credit', 'transfer', 'airtime', 'data'));

-- Purchases have no receiving Nairova account. All existing writers still
-- supply a receiver; only future purchase inserts may use NULL.
ALTER TABLE transactions ALTER COLUMN receiver_account_id DROP NOT NULL;

-- Purchase details. The transactions row remains the authoritative money
-- record; this table stores the simulated telecom metadata plus a snapshot
-- of the bundle at purchase time, so later catalogue changes can never
-- rewrite history. One detail row per ledger row at most.
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
  kind TEXT NOT NULL CHECK (kind IN ('airtime', 'data')),
  network TEXT NOT NULL CHECK (network IN ('MTN', 'Airtel', 'Glo', '9mobile')),
  recipient_msisdn TEXT NOT NULL
    CHECK (recipient_msisdn ~ '^\+234[789][01][0-9]{8}$'),
  bundle_code TEXT,
  bundle_name TEXT,
  allowance TEXT,
  validity TEXT,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_transaction ON purchases (transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchases_msisdn ON purchases (recipient_msisdn);

-- Allow purchase notifications alongside every existing event type.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_event_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_event_type_check
  CHECK (event_type IN (
    'transfer_sent', 'transfer_received', 'deposit_received',
    'admin_credit_received', 'airtime_purchased', 'data_purchased'
  ));
