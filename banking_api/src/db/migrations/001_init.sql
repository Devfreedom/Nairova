-- Migration 001: initial normalized schema for classroom banking demo.
-- Users hold credentials; accounts hold balances (NUMERIC, never negative);
-- transactions form the append-only ledger referencing accounts.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  account_number CHAR(10) NOT NULL UNIQUE CHECK (account_number ~ '^[0-9]{10}$'),
  balance NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'admin_credit', 'transfer')),
  sender_account_id INTEGER REFERENCES accounts(id),
  receiver_account_id INTEGER NOT NULL REFERENCES accounts(id),
  admin_user_id INTEGER REFERENCES users(id),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts (account_number);
CREATE INDEX IF NOT EXISTS idx_tx_receiver_created ON transactions (receiver_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_sender_created ON transactions (sender_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_admin ON transactions (admin_user_id);
