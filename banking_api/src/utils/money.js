const MAX_AMOUNT = 100000000; // 100M naira cap for classroom demo
const DECIMAL_PLACES = 2;
// Settled v1 policy for internal Nairova transfers. Deposits and admin
// credits intentionally keep the wider MAX_AMOUNT cap (no approved limits).
const TRANSFER_MIN_AMOUNT = 100;
const TRANSFER_MAX_AMOUNT = 1000000;

function normalizeAmount(raw) {
  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    // Strictly numeric: optional digits, optional one decimal point with digits
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return { ok: false, error: "Amount must be a positive number" };
    }
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "Amount must be a positive number" };
  }
  if (value <= 0) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (value > MAX_AMOUNT) {
    return { ok: false, error: `Amount must not exceed ${MAX_AMOUNT}` };
  }
  const rounded = Math.round(value * 100) / 100;
  // Reject more precision than supported (e.g. 10.999 must be 11.00 explicitly)
  const decimals = String(raw).includes(".")
    ? String(raw).replace(/,/g, "").split(".")[1].length
    : 0;
  if (decimals > DECIMAL_PLACES) {
    return { ok: false, error: "Amount supports at most 2 decimal places" };
  }
  return { ok: true, value: rounded };
}

module.exports = { normalizeAmount, MAX_AMOUNT, TRANSFER_MIN_AMOUNT, TRANSFER_MAX_AMOUNT };
