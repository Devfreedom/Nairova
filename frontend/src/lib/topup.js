// Pure top-up helpers, mirroring lib/transfer.js so the purchase flow gets
// the same pending-intent and uncertain-outcome guarantees. No secrets ever
// pass through here: pending intents carry the idempotency key plus the
// non-secret payload only. Shared classifiers come from transfer.js so both
// flows classify outcomes identically.
import { formatNaira } from "./format.js";
import { mintKey, isUncertainOutcome, isPinlessError, lagosTime } from "./transfer.js";

export { mintKey, isUncertainOutcome, isPinlessError, lagosTime };
export { SUBMIT_TIMEOUT_MS } from "./transfer.js";

export const TOPUP_PENDING_KEY = "nairova.pendingTopup";

function defaultStorage() {
  return globalThis.sessionStorage;
}

// Pending intent shape:
// { key, kind: "airtime"|"data", network, msisdn, msisdnDisplay,
//   amount, amountDisplay, bundle: {code,name,allowance,validity}|null,
//   narration }
// Reads return null for absent, corrupt, or misshapen data.
export function loadTopupPending(storage = defaultStorage()) {
  try {
    const raw = storage.getItem(TOPUP_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      !p ||
      typeof p.key !== "string" ||
      (p.kind !== "airtime" && p.kind !== "data") ||
      typeof p.network !== "string" ||
      typeof p.msisdn !== "string" ||
      typeof p.amount !== "number" ||
      !Number.isFinite(p.amount)
    ) {
      return null;
    }
    if (p.kind === "data") {
      const b = p.bundle;
      if (!b || typeof b.code !== "string" || typeof b.name !== "string") return null;
    }
    return {
      key: p.key,
      kind: p.kind,
      network: p.network,
      msisdn: p.msisdn,
      msisdnDisplay: typeof p.msisdnDisplay === "string" ? p.msisdnDisplay : p.msisdn,
      amount: p.amount,
      amountDisplay: typeof p.amountDisplay === "string" ? p.amountDisplay : String(p.amount),
      bundle: p.kind === "data"
        ? {
            code: p.bundle.code,
            name: p.bundle.name,
            allowance: typeof p.bundle.allowance === "string" ? p.bundle.allowance : "",
            validity: typeof p.bundle.validity === "string" ? p.bundle.validity : "",
          }
        : null,
      narration: typeof p.narration === "string" ? p.narration : "",
    };
  } catch {
    return null;
  }
}

// Explicit whitelist: a PIN, token, or any other secret can never be stored
// even if passed in.
export function saveTopupPending(pending, storage = defaultStorage()) {
  try {
    storage.setItem(
      TOPUP_PENDING_KEY,
      JSON.stringify({
        key: pending.key,
        kind: pending.kind,
        network: pending.network,
        msisdn: pending.msisdn,
        msisdnDisplay: pending.msisdnDisplay,
        amount: pending.amount,
        amountDisplay: pending.amountDisplay,
        bundle: pending.bundle
          ? {
              code: pending.bundle.code,
              name: pending.bundle.name,
              allowance: pending.bundle.allowance,
              validity: pending.bundle.validity,
            }
          : null,
        narration: pending.narration,
      })
    );
  } catch {
    // Storage may be unavailable (private mode); the in-memory flow continues.
  }
}

export function clearTopupPending(storage = defaultStorage()) {
  try {
    storage.removeItem(TOPUP_PENDING_KEY);
  } catch {
    // Ignore storage failures.
  }
}

// Display-only masking of a phone number: 08012345678 -> 801 **** *678.
// Masks on the national significant digits so local and E.164 spellings of
// the same number mask identically. Never used for charging or lookup.
export function maskMsisdn(msisdn) {
  const digits = String(msisdn || "").replace(/\D/g, "");
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  if (national.length < 7) return String(msisdn || "");
  return `${national.slice(0, 3)} **** *${national.slice(-3)}`;
}

// Plain-text receipt built exclusively from backend-confirmed values.
export function buildTopupReceiptText({
  reference,
  timestamp,
  kind,
  network,
  msisdn,
  amount,
  fee,
  bundle,
  narration,
  newBalance,
}) {
  const lines = [
    `Nairova ${kind === "data" ? "data" : "airtime"} receipt`,
    "Simulated purchase. No real airtime or data was delivered.",
    "",
    "Status: Success",
    `Reference: ${reference}`,
    timestamp ? `Date: ${lagosTime(timestamp)} (Africa/Lagos)` : null,
    `Network: ${network}`,
    `Recipient: ${maskMsisdn(msisdn)}`,
    bundle ? `Bundle: ${bundle.name} (${bundle.allowance}, ${bundle.validity})` : null,
    narration ? `Narration: ${narration}` : null,
    `Amount: ${formatNaira(amount)}`,
    `Fee: ${formatNaira(fee ?? 0)}`,
    newBalance !== undefined && newBalance !== null ? `New balance: ${formatNaira(newBalance)}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}
