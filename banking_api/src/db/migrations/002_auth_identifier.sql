-- Migration 002: email-or-phone login identifiers.
-- Adds a nullable phone column (canonical E.164, e.g. +2348012345678),
-- relaxes email to nullable, and requires at least one identifier.
-- Preserves every existing row: emails, password hashes, accounts,
-- balances, transactions, and roles are untouched.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Allow phone-only accounts going forward; existing rows keep their email.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Replace the blanket unique constraint with partial unique indexes so
-- multiple NULLs are allowed but real values stay unique.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

-- Every user must have at least one login identifier.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identifier_check;
ALTER TABLE users ADD CONSTRAINT users_identifier_check CHECK (email IS NOT NULL OR phone IS NOT NULL);
