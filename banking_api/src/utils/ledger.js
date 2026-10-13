// Ledger helpers for Phase 1b: backend-generated transaction references,
// idempotency-key validation, and request fingerprints.
//
// Fingerprints deliberately include only transaction-affecting fields
// (operation, actor, amount, target, narration/reason, fee). Passwords,
// transaction PINs, JWTs, and other secrets are never fingerprint inputs.
const crypto = require("crypto");

// Collision-resistant reference: date prefix plus 48 bits of randomness,
// e.g. NVR-20261013-A1B2C3D4E5F6. Uniqueness is enforced by the
// transactions_reference_unique constraint; callers retry on conflict.
function generateReference(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `NVR-${day}-${rand}`;
}

// Client-generated idempotency keys are opaque strings (UUIDs recommended).
// Absent keys preserve the legacy non-idempotent behavior for backward
// compatibility; present keys must match this shape or the request is rejected.
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function validateIdempotencyKey(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, key: null };
  }
  if (typeof raw !== "string" || !KEY_PATTERN.test(raw)) {
    return { ok: false, error: "Idempotency key must be 1-128 characters of letters, digits, - or _" };
  }
  return { ok: true, key: raw };
}

function fingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

function fingerprintEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Optional narration: trimmed free text up to 140 characters. Empty means none.
const MAX_NARRATION_LENGTH = 140;

function normalizeNarration(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, narration: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Narration must be text" };
  }
  const narration = raw.trim();
  if (!narration) {
    return { ok: true, narration: null };
  }
  if (narration.length > MAX_NARRATION_LENGTH) {
    return { ok: false, error: `Narration must be at most ${MAX_NARRATION_LENGTH} characters` };
  }
  return { ok: true, narration };
}

module.exports = {
  generateReference,
  validateIdempotencyKey,
  fingerprint,
  fingerprintEqual,
  normalizeNarration,
  MAX_NARRATION_LENGTH,
};
