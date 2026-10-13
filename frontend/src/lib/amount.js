// Strict, testable parser for human-typed naira amounts.
// Accepts plain integers ("100000"), correctly grouped thousands ("100,000"),
// and decimals up to 2 places ("100,000.50"). The raw text is never reformatted
// here, so callers can keep the input cursor stable while typing.
//
// Server-side validation in banking_api/src/utils/money.js remains authoritative;
// this helper only gives faster, more accurate client-side feedback.

export const MAX_AMOUNT = 100000000; // matches backend cap
export const MAX_DECIMALS = 2;

const PLAIN = /^\d+(\.\d+)?$/;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

function checkRange(value) {
  if (!Number.isFinite(value)) {
    return { ok: false, error: "Enter a valid numeric amount." };
  }
  if (value <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  if (value > MAX_AMOUNT) {
    return { ok: false, error: "Amount must not exceed ₦100,000,000 (demo limit)." };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export function parseAmount(raw) {
  if (typeof raw === "number") {
    const text = String(raw);
    if (text.includes(".") && text.split(".")[1].length > MAX_DECIMALS) {
      return { ok: false, error: "Amount supports at most 2 decimal places." };
    }
    return checkRange(raw);
  }

  if (typeof raw !== "string") {
    return { ok: false, error: "Enter an amount." };
  }

  const text = raw.trim();
  if (!text) {
    return { ok: false, error: "Enter an amount." };
  }
  if (text.startsWith("-")) {
    return { ok: false, error: "Amount cannot be negative." };
  }
  if (text.startsWith("+")) {
    return { ok: false, error: "Enter a valid amount using digits and an optional decimal point, e.g. 100000.50." };
  }

  if (text.includes(",")) {
    if (!GROUPED.test(text)) {
      return { ok: false, error: "Commas must group thousands correctly, e.g. 100,000 or 100,000.50." };
    }
  } else if (!PLAIN.test(text)) {
    return { ok: false, error: "Enter a valid amount using digits and an optional decimal point, e.g. 100000.50." };
  }

  const digits = text.replace(/,/g, "");
  const dot = digits.indexOf(".");
  if (dot !== -1 && digits.length - dot - 1 > MAX_DECIMALS) {
    return { ok: false, error: "Amount supports at most 2 decimal places." };
  }

  return checkRange(Number(digits));
}
