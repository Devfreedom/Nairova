// PostgreSQL data-access layer. All SQL is parameterized; NUMERIC money values
// are computed inside the database, never with JavaScript floats.
// Amounts cross the boundary as exact decimal strings ("1234.50").
const crypto = require("crypto");
const AppError = require("../utils/AppError");
const { getPool } = require("./pool");

const DUPLICATE_EMAIL_MESSAGE = "Email is already registered";

const toNum = (v) => Number(v);

function mapUserAccount(r) {
  return {
    id: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role,
    passwordHash: r.password_hash,
    pinHash: r.pin_hash,
    createdAt: r.user_created_at,
    accountId: r.account_id,
    accountNumber: r.account_number,
    balance: toNum(r.balance),
    currency: r.currency,
  };
}

function mapTxn(r) {
  const txn = {
    id: r.id,
    type: r.type,
    senderId: r.sender_user_id,
    senderAccountNumber: r.sender_account_number,
    receiverId: r.receiver_user_id,
    receiverAccountNumber: r.receiver_account_number,
    amount: toNum(r.amount),
    status: r.status,
    timestamp: r.created_at,
  };
  if (r.admin_email) txn.adminEmail = r.admin_email;
  return txn;
}

const TXN_SELECT = `
  SELECT t.id, t.type, t.amount, t.status, t.created_at,
         s_usr.id AS sender_user_id, s_acct.account_number AS sender_account_number,
         r_usr.id AS receiver_user_id, r_acct.account_number AS receiver_account_number,
         a_usr.email AS admin_email
  FROM transactions t
  LEFT JOIN accounts s_acct ON s_acct.id = t.sender_account_id
  LEFT JOIN users s_usr ON s_usr.id = s_acct.user_id
  JOIN accounts r_acct ON r_acct.id = t.receiver_account_id
  JOIN users r_usr ON r_usr.id = r_acct.user_id
  LEFT JOIN users a_usr ON a_usr.id = t.admin_user_id
`;

function generateAccountNumber() {
  return crypto.randomInt(1000000000, 10000000000).toString();
}

function isUniqueViolation(err, constraint) {
  return err && err.code === "23505" && (!constraint || String(err.constraint) === constraint);
}

async function findUserByEmail(email, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.role, u.password_hash, u.pin_hash,
            u.created_at AS user_created_at,
            a.id AS account_id, a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );
  return rows.length ? mapUserAccount(rows[0]) : null;
}

async function findUserById(id, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.role, u.password_hash, u.pin_hash,
            u.created_at AS user_created_at,
            a.id AS account_id, a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  return rows.length ? mapUserAccount(rows[0]) : null;
}

// Registration creates the user and its account atomically.
async function registerUser({ name, email, passwordHash }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let userId;
    try {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'user') RETURNING id`,
        [name, email, passwordHash]
      );
      userId = rows[0].id;
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err, "users_email_key")) {
        throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
      }
      throw err;
    }
    let accountNumber = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateAccountNumber();
      try {
        await client.query(
          `INSERT INTO accounts (user_id, account_number, balance, currency)
           VALUES ($1, $2, 0, 'NGN')`,
          [userId, candidate]
        );
        accountNumber = candidate;
        break;
      } catch (err) {
        if (!isUniqueViolation(err, "accounts_account_number_key")) throw err;
      }
    }
    if (!accountNumber) {
      await client.query("ROLLBACK");
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      throw new AppError("Could not allocate an account number. Please try again.", 500);
    }
    await client.query("COMMIT");
    return { id: userId, name, email, role: "user", balance: 0, pin: null, accountNumber };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Transaction may already be closed; the original error takes precedence.
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updatePasswordHash(userId, passwordHash) {
  const { rowCount } = await getPool().query(
    "UPDATE users SET password_hash = $1 WHERE id = $2",
    [passwordHash, userId]
  );
  return rowCount > 0;
}

async function setPinHash(userId, pinHash) {
  const { rowCount } = await getPool().query(
    "UPDATE users SET pin_hash = $1 WHERE id = $2",
    [pinHash, userId]
  );
  return rowCount > 0;
}

async function listUsers() {
  const { rows } = await getPool().query(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     ORDER BY u.id`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    balance: toNum(r.balance),
    currency: r.currency,
    accountNumber: r.account_number,
    createdAt: r.created_at,
  }));
}

async function findAccountByNumber(accountNumber) {
  const { rows } = await getPool().query(
    `SELECT a.id AS account_id, a.account_number, a.balance,
            u.id AS user_id, u.name
     FROM accounts a JOIN users u ON u.id = a.user_id
     WHERE a.account_number = $1`,
    [accountNumber]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    accountId: r.account_id,
    accountNumber: r.account_number,
    balance: toNum(r.balance),
    userId: r.user_id,
    name: r.name,
  };
}

async function transactionsForUser(userId) {
  const { rows } = await getPool().query(
    `${TXN_SELECT}
     WHERE s_acct.user_id = $1 OR r_acct.user_id = $1
     ORDER BY t.created_at DESC, t.id DESC`,
    [userId]
  );
  return rows.map(mapTxn);
}

async function allTransactions() {
  const { rows } = await getPool().query(
    `${TXN_SELECT} ORDER BY t.created_at DESC, t.id DESC`
  );
  return rows.map(mapTxn);
}

// Self-deposit of simulated funds: balance update + ledger insert in one transaction.
async function depositToAccount(userId, amountText) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT a.id, a.account_number FROM accounts a WHERE a.user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const accountId = rows[0].id;
    const updated = await client.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance, account_number`,
      [amountText, accountId]
    );
    await client.query(
      `INSERT INTO transactions (type, sender_account_id, receiver_account_id, amount, status)
       VALUES ('deposit', NULL, $1, $2, 'success')`,
      [accountId, amountText]
    );
    await client.query("COMMIT");
    return {
      newBalance: toNum(updated.rows[0].balance),
      accountNumber: updated.rows[0].account_number,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Original error takes precedence.
    }
    throw err;
  } finally {
    client.release();
  }
}

// Admin credit: lock recipient, update with SQL arithmetic, insert ledger row, commit.
async function adminCredit({ adminId, accountNumber, amountText }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT a.id, u.id AS user_id, u.name FROM accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.account_number = $1 FOR UPDATE OF a`,
      [accountNumber]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const recipient = rows[0];
    const adminRes = await client.query(
      `SELECT u.email, a.account_number FROM users u
       LEFT JOIN accounts a ON a.user_id = u.id WHERE u.id = $1`,
      [adminId]
    );
    const adminRow = adminRes.rows[0] || {};
    const updated = await client.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance`,
      [amountText, recipient.id]
    );
    const inserted = await client.query(
      `INSERT INTO transactions (type, sender_account_id, receiver_account_id, admin_user_id, amount, status)
       VALUES ('admin_credit', NULL, $1, $2, $3, 'success')
       RETURNING id, type, amount, status, created_at`,
      [recipient.id, adminId, amountText]
    );
    await client.query("COMMIT");
    const t = inserted.rows[0];
    return {
      transaction: {
        id: t.id,
        type: t.type,
        senderId: adminId,
        senderAccountNumber: adminRow.account_number || null,
        adminEmail: adminRow.email || null,
        receiverId: recipient.user_id,
        receiverAccountNumber: accountNumber,
        amount: toNum(t.amount),
        status: t.status,
        timestamp: t.created_at,
      },
      newBalance: toNum(updated.rows[0].balance),
      recipientName: recipient.name,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Original error takes precedence.
    }
    throw err;
  } finally {
    client.release();
  }
}

// Atomic transfer. Rows are locked in ascending account-id order to avoid deadlocks;
// the sender debit is conditional on sufficient funds so concurrent transfers
// cannot overdraw the account. Rolls back everything on any failure.
async function transferFunds({ senderUserId, receiverAccountNumber, amountText }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const senderRes = await client.query(
      `SELECT a.id, a.account_number, a.balance, u.name FROM accounts a
       JOIN users u ON u.id = a.user_id WHERE a.user_id = $1`,
      [senderUserId]
    );
    if (!senderRes.rows.length) {
      await client.query("ROLLBACK");
      return { error: { message: "Sender not found", status: 404 } };
    }
    const receiverRes = await client.query(
      `SELECT a.id, a.account_number, u.id AS user_id, u.name FROM accounts a
       JOIN users u ON u.id = a.user_id WHERE a.account_number = $1`,
      [receiverAccountNumber]
    );
    if (!receiverRes.rows.length) {
      await client.query("ROLLBACK");
      return { error: { message: "Receiver not found", status: 404 } };
    }
    const sender = senderRes.rows[0];
    const receiver = receiverRes.rows[0];
    if (sender.id === receiver.id) {
      await client.query("ROLLBACK");
      return { error: { message: "You cannot transfer to yourself", status: 400 } };
    }
    // Lock both rows in a consistent (ascending id) order.
    const [firstId, secondId] =
      sender.id < receiver.id ? [sender.id, receiver.id] : [receiver.id, sender.id];
    await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [firstId]);
    await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [secondId]);

    // Conditional debit: succeeds only when funds remain sufficient.
    const debited = await client.query(
      `UPDATE accounts SET balance = balance - $1
       WHERE id = $2 AND balance >= $1 RETURNING balance`,
      [amountText, sender.id]
    );
    if (!debited.rowCount) {
      await client.query("ROLLBACK");
      return { error: { message: "Insufficient balance", status: 400 } };
    }
    const credited = await client.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance`,
      [amountText, receiver.id]
    );
    await client.query(
      `INSERT INTO transactions (type, sender_account_id, receiver_account_id, amount, status)
       VALUES ('transfer', $1, $2, $3, 'success')`,
      [sender.id, receiver.id, amountText]
    );
    await client.query("COMMIT");
    return {
      senderNewBalance: toNum(debited.rows[0].balance),
      receiverNewBalance: toNum(credited.rows[0].balance),
      receiverName: receiver.name,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Original error takes precedence.
    }
    throw err;
  } finally {
    client.release();
  }
}

// Idempotent admin bootstrap. Never promotes an existing ordinary user:
// an email collision with a non-admin is reported as a conflict to resolve manually.
async function bootstrapAdminRecord({ name, email, passwordHash }) {
  const pool = getPool();
  const existing = await findUserByEmail(email, pool);
  if (existing) {
    if (existing.role === "admin") return { user: existing, created: false, conflict: false };
    return { user: existing, created: false, conflict: true };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin') RETURNING id`,
      [name, email, passwordHash]
    );
    const userId = rows[0].id;
    let accountNumber = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateAccountNumber();
      try {
        await client.query(
          `INSERT INTO accounts (user_id, account_number, balance, currency)
           VALUES ($1, $2, 0, 'NGN')`,
          [userId, candidate]
        );
        accountNumber = candidate;
        break;
      } catch (err) {
        if (!isUniqueViolation(err, "accounts_account_number_key")) throw err;
      }
    }
    if (!accountNumber) {
      throw new AppError("Could not allocate an account number. Please try again.", 500);
    }
    await client.query("COMMIT");
    return {
      user: { id: userId, name, email, role: "admin", balance: 0, accountNumber },
      created: true,
      conflict: false,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Original error takes precedence.
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findUserByEmail,
  findUserById,
  registerUser,
  updatePasswordHash,
  setPinHash,
  listUsers,
  findAccountByNumber,
  transactionsForUser,
  allTransactions,
  depositToAccount,
  adminCredit,
  transferFunds,
  bootstrapAdminRecord,
};
