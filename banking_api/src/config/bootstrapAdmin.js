const bcrypt = require("bcrypt");

const { users, getNextId } = require("../data/users");

function generateAccountNumber() {
  let accountNumber;
  do {
    accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  } while (users.find((user) => user.accountNumber === accountNumber));
  return accountNumber;
}

// Idempotent: only creates the admin if ADMIN_EMAIL is configured and not already present.
// Never hardcodes credentials; all values come from environment configuration.
async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return null;
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = users.find((u) => u.email === email);
  if (existing) {
    if (existing.role !== "admin") {
      existing.role = "admin";
    }
    return existing;
  }
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = {
    id: getNextId(),
    name: (ADMIN_NAME || "Demo Administrator").trim(),
    email,
    password: hashedPassword,
    role: "admin",
    balance: 0,
    pin: null,
    accountNumber: generateAccountNumber(),
  };
  users.push(admin);
  return admin;
}

module.exports = { bootstrapAdmin };
