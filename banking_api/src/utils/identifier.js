// Shared email-or-phone identifier logic for registration and login.
// Canonical phone form is E.164: +234XXXXXXXXXX. Accepts 080XXXXXXXX,
// 234XXXXXXXXXX, and +234XXXXXXXXXX spellings. Never logs credentials.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(value) {
  return String(value).replace(/\D/g, "");
}

function normalizeEmail(raw) {
  return String(raw).trim().toLowerCase();
}

function normalizePhone(raw) {
  const cleaned = String(raw).trim().replace(/[\s\-().]/g, "");
  let digits = digitsOnly(cleaned);
  if (cleaned.startsWith("+")) {
    // digitsOnly already stripped the plus; re-anchor below.
  }
  if (/^0\d{10}$/.test(digits)) {
    // 08012345678 -> +2348012345678
    return `+234${digits.slice(1)}`;
  }
  if (/^234\d{10}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^\+?234\d{10}$/.test(cleaned.replace(/\s/g, ""))) {
    const d = digits.slice(-13);
    return `+${d}`;
  }
  return null;
}

function isValidPhone(value) {
  return typeof value === "string" && /^\+234[789][01]\d{8}$/.test(value);
}

// Returns { ok, kind, value } or { ok:false, error }.
function classifyIdentifier(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Enter your email address or phone number" };
  }
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const email = normalizeEmail(trimmed);
    if (!EMAIL_REGEX.test(email)) {
      return { ok: false, error: "Enter a valid email address or phone number" };
    }
    return { ok: true, kind: "email", value: email };
  }
  const phone = normalizePhone(trimmed);
  if (phone && isValidPhone(phone)) {
    return { ok: true, kind: "phone", value: phone };
  }
  // Maybe it was a malformed email without @ handling above; give one message.
  return { ok: false, error: "Enter a valid email address or a Nigerian phone number (e.g. 08012345678)" };
}

module.exports = {
  EMAIL_REGEX,
  classifyIdentifier,
  normalizeEmail,
  normalizePhone,
  isValidPhone,
};
