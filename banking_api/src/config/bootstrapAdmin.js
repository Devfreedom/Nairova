const bcrypt = require("bcrypt");

const { bootstrapAdminRecord } = require("../db/store");

// Idempotent: creates the admin only when ADMIN_EMAIL/ADMIN_PASSWORD are
// configured and no user with that email exists. Never hardcodes credentials;
// all values come from environment configuration.
//
// Conflict policy: if the configured email already belongs to an ordinary
// user, the bootstrap does NOT promote them. It logs a warning and leaves the
// row untouched. To resolve, either change ADMIN_EMAIL or promote the account
// explicitly in the database, e.g.:
//   UPDATE users SET role = 'admin' WHERE email = '<the-email>';
async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return null;
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await bootstrapAdminRecord({
    name: (ADMIN_NAME || "Demo Administrator").trim(),
    email,
    passwordHash: hashedPassword,
  });
  if (result.conflict) {
    console.warn(
      `Admin bootstrap skipped: ${email} already exists as a non-admin user. ` +
        "It was NOT promoted. Resolve by changing ADMIN_EMAIL or promoting the row explicitly."
    );
    return null;
  }
  return result.user;
}

module.exports = { bootstrapAdmin };
