// Pure transfer-flow helpers, extracted from the Transfer page so they are
// unit-testable without a DOM. No secrets ever pass through here: pending
// intents carry the idempotency key plus the non-secret payload only.
import { formatNaira } from "./format.js";

export const PENDING_KEY = "nairova.pendingTransfer";
export const SUBMIT_TIMEOUT_MS = 30000;

export function mintKey() {
  return crypto.randomUUID();
}

function defaultStorage() {
  return globalThis.sessionStorage;
}

// Reads a pending intent. Returns null for absent, corrupt, or misshapen
// data — a foreign or hand-edited value must never drive a retry.
export function loadPending(storage = defaultStorage()) {
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      !p ||
      typeof p.key !== "string" ||
      typeof p.receiverAccountNumber !== "string" ||
      typeof p.receiverName !== "string" ||
      typeof p.amount !== "number" ||
      !Number.isFinite(p.amount)
    ) {
      return null;
    }
    return {
      key: p.key,
      receiverAccountNumber: p.receiverAccountNumber,
      receiverName: p.receiverName,
      amount: p.amount,
      amountDisplay: typeof p.amountDisplay === "string" ? p.amountDisplay : String(p.amount),
      narration: typeof p.narration === "string" ? p.narration : "",
    };
  } catch {
    return null;
  }
}

// Persists a pending intent with an explicit field whitelist, so a PIN,
// token, or any other secret can never be stored even if passed in.
export function savePending(pending, storage = defaultStorage()) {
  try {
    storage.setItem(
      PENDING_KEY,
      JSON.stringify({
        key: pending.key,
        receiverAccountNumber: pending.receiverAccountNumber,
        receiverName: pending.receiverName,
        amount: pending.amount,
        amountDisplay: pending.amountDisplay,
        narration: pending.narration,
      })
    );
  } catch {
    // Storage may be unavailable (private mode); the in-memory flow continues.
  }
}

export function clearPending(storage = defaultStorage()) {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // Ignore storage failures.
  }
}

// 4xx responses are definitive backend rejections: validation, auth, and rate
// limits are all decided before the money transaction runs, so nothing was
// executed. Network failures, timeouts, and 5xx are uncertain — the server
// may have committed without the browser receiving the response.
export function isUncertainOutcome(err) {
  if (err?.isNetworkError) return true;
  const status = err?.status;
  if (status === null || status === undefined) return true;
  return status >= 500;
}

export function isPinlessError(err) {
  return /must create a pin/i.test(err?.message || "");
}

export function lagosTime(iso) {
  try {
    return new Date(iso).toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Plain-text receipt built exclusively from backend-confirmed values.
// Optional fields degrade to absence, never to invented text.
export function buildReceiptText({
  reference,
  timestamp,
  fromName,
  fromAccount,
  toName,
  toAccount,
  amount,
  fee,
  narration,
}) {
  const lines = [
    "Nairova transfer receipt",
    "Simulated transfer between Nairova accounts. Not a real bank.",
    "",
    "Status: Success",
    `Reference: ${reference}`,
    timestamp ? `Date: ${lagosTime(timestamp)} (Africa/Lagos)` : null,
    `From: ${fromName || "Your Nairova account"}${fromAccount ? ` (${fromAccount})` : ""}`,
    `To: ${toName} (${toAccount})`,
    `Amount: ${formatNaira(amount)}`,
    `Fee: ${formatNaira(fee ?? 0)}`,
    narration ? `Narration: ${narration}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}
