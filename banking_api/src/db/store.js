// PostgreSQL data-access layer. All SQL is parameterized; NUMERIC money values
// are computed inside the database, never with JavaScript floats.
// Amounts cross the boundary as exact decimal strings ("1234.50").
const crypto = require("crypto");
const AppError = require("../utils/AppError");
const { getPool } = require("./pool");
const { generateReference, fingerprintEqual } = require("../utils/ledger");

const DUPLICATE_EMAIL_MESSAGE = "Email is already registered";
const DUPLICATE_PHONE_MESSAGE = "Phone number is already registered";

const toNum = (v) => Number(v);

function mapUserAccount(r) {
  return {
    id: r.user_id,
    name: r.name,
    email: r.email || null,
    phone: r.phone || null,
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
    reference: r.reference || null,
    type: r.type,
    senderId: r.sender_user_id,
    senderAccountNumber: r.sender_account_number,
    receiverId: r.receiver_user_id,
    receiverAccountNumber: r.receiver_account_number,
    amount: toNum(r.amount),
    fee: r.fee === undefined || r.fee === null ? 0 : toNum(r.fee),
    narration: r.narration || null,
    status: r.status,
    timestamp: r.created_at,
  };
  if (r.admin_email) txn.adminEmail = r.admin_email;
  return txn;
}

const TXN_SELECT = `
  SELECT t.id, t.reference, t.type, t.amount, t.fee, t.narration, t.status, t.created_at,
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

// Claims an idempotency key inside the caller's open transaction. The INSERT
// runs first so concurrent duplicates serialize on the primary key: exactly
// one request wins and executes, the others wait on SELECT ... FOR UPDATE
// and then receive the winner's stored outcome without moving money.
// Returns { fresh:true } for the winner, { replay } for a legitimate retry,
// or { conflict } when the key is owned by another user or bound to a
// different payload. Validation failures never reach this point, so a key
// is only ever consumed by an actually-executed operation.
async function claimIdempotencyKey(client, { key, userId, endpoint, fingerprint }) {
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, fingerprint)
     VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING RETURNING key`,
    [key, userId, endpoint, fingerprint]
  );
  if (inserted.rowCount) {
    return { fresh: true };
  }
  const { rows } = await client.query(
    `SELECT user_id, endpoint, fingerprint, status, response_code, response_body
     FROM idempotency_keys WHERE key = $1 FOR UPDATE`,
    [key]
  );
  // Defensive: if the losing insert saw a conflict but the row is gone, the
  // winner rolled back, so the key is free. Retrying the insert once resolves
  // it; anything else is a genuine anomaly and must not move money.
  if (!rows.length) {
    const retry = await client.query(
      `INSERT INTO idempotency_keys (key, user_id, endpoint, fingerprint)
       VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [key, userId, endpoint, fingerprint]
    );
    if (retry.rowCount) {
      return { fresh: true };
    }
    return { conflict: { message: "Idempotency key is already in use. Retry with a new key.", status: 409 } };
  }
  const row = rows[0];
  if (row.user_id !== userId) {
    return { conflict: { message: "Idempotency key is already in use. Retry with a new key.", status: 409 } };
  }
  if (row.endpoint !== endpoint || !fingerprintEqual(row.fingerprint, fingerprint)) {
    return {
      conflict: {
        message: "Idempotency key was already used with different transaction details. Use a new key for a new operation.",
        status: 409,
      },
    };
  }
  if (row.status === "completed" && row.response_body) {
    return { replay: true, code: row.response_code || 200, body: row.response_body };
  }
  // A claimed-but-never-completed row cannot exist after its transaction
  // closes (claim and completion share one transaction), so reaching here
  // means an anomaly. Refuse rather than risk a second execution.
  return { conflict: { message: "Idempotency key is already in use. Retry with a new key.", status: 409 } };
}

async function completeIdempotencyKey(client, { key, code, body }) {
  await client.query(
    `UPDATE idempotency_keys SET status = 'completed', response_code = $2, response_body = $3 WHERE key = $1`,
    [key, code, JSON.stringify(body)]
  );
}

// ---- In-app notifications (Phase 5) --------------------------------------
// Notification rows are written with the caller's open transaction, right
// after the ledger insert they describe, so they commit or roll back with
// the money movement itself. Replays return before any insert, and the
// (user_id, dedupe_key) unique constraint backstops any double execution.
// Messages carry amounts, references, and counterpart account numbers only
// (already visible to both parties in history) — never personal names.

// Backend naira rendering for notification copy ("₦1,500.00").
function nairaText(amountText) {
  return `₦${Number(amountText).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function createNotification(client, { userId, eventType, title, message, reference, destination, dedupeKey }) {
  await client.query(
    `INSERT INTO notifications (user_id, event_type, title, message, reference, destination, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [userId, eventType, title, message, reference || null, destination || null, dedupeKey]
  );
}

function mapNotification(r) {
  return {
    id: r.id,
    eventType: r.event_type,
    title: r.title,
    message: r.message,
    reference: r.reference || null,
    destination: r.destination || null,
    createdAt: r.created_at,
    readAt: r.read_at || null,
    read: r.read_at !== null && r.read_at !== undefined,
  };
}

async function listNotifications(userId, { limit = 20, cursor = null } = {}) {
  const params = [userId];
  let cursorClause = "";
  if (cursor !== null) {
    params.push(cursor);
    cursorClause = `AND n.id < $${params.length}`;
  }
  params.push(limit + 1);
  const { rows } = await getPool().query(
    `SELECT n.id, n.event_type, n.title, n.message, n.reference, n.destination, n.created_at, n.read_at
     FROM notifications n
     WHERE n.user_id = $1 ${cursorClause}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $${params.length}`,
    params
  );
  const items = rows.map(mapNotification);
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

async function unreadNotificationCount(userId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0].count;
}

// Returns { missing:true } when the id is unknown or owned by someone else
// (both map to 404 so ids are not oracle-able), { already:true } when the
// row is already read, otherwise marks it read and returns the row.
async function markNotificationRead(userId, id) {
  const { rows } = await getPool().query(
    `SELECT id, user_id, event_type, title, message, reference, destination, created_at, read_at
     FROM notifications WHERE id = $1`,
    [id]
  );
  if (!rows.length || rows[0].user_id !== userId) {
    return { missing: true };
  }
  if (rows[0].read_at) {
    return { already: true, notification: mapNotification(rows[0]) };
  }
  const updated = await getPool().query(
    `UPDATE notifications SET read_at = now() WHERE id = $1
     RETURNING id, event_type, title, message, reference, destination, created_at, read_at`,
    [id]
  );
  return { notification: mapNotification(updated.rows[0]) };
}

async function markAllNotificationsRead(userId) {
  const { rowCount } = await getPool().query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return { updated: rowCount };
}

// Inserts one ledger row with a backend-generated unique reference.
// Retries with a fresh reference on the (unlikely) random collision.
async function insertLedgerRow(client, { type, senderId, receiverId, adminId, amountText, narration, feeText }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await client.query(
        `INSERT INTO transactions (type, sender_account_id, receiver_account_id, admin_user_id, amount, fee, narration, reference, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'success')
         RETURNING id, reference, created_at`,
        [type, senderId, receiverId, adminId, amountText, feeText, narration, generateReference()]
      );
      return rows[0];
    } catch (err) {
      if (!isUniqueViolation(err, "transactions_reference_unique")) throw err;
    }
  }
  throw new AppError("Could not record the transaction. Please try again.", 500);
}

async function findUserByEmail(email, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, u.role, u.password_hash, u.pin_hash,
            u.created_at AS user_created_at,
            a.id AS account_id, a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );
  return rows.length ? mapUserAccount(rows[0]) : null;
}

async function findUserByPhone(phone, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, u.role, u.password_hash, u.pin_hash,
            u.created_at AS user_created_at,
            a.id AS account_id, a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     WHERE u.phone = $1`,
    [phone]
  );
  return rows.length ? mapUserAccount(rows[0]) : null;
}

async function findUserByIdentifier({ kind, value }, client) {
  if (kind === "phone") return findUserByPhone(value, client);
  return findUserByEmail(value, client);
}

async function findUserById(id, client) {
  const db = client || getPool();
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, u.role, u.password_hash, u.pin_hash,
            u.created_at AS user_created_at,
            a.id AS account_id, a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  return rows.length ? mapUserAccount(rows[0]) : null;
}

// Registration creates the user and its account atomically.
// Either email or phone (canonical E.164) must be provided; uniqueness for
// both is enforced by partial unique indexes in migration 002.
// A transaction PIN hash is mandatory for new accounts (Phase 2A); legacy
// PIN-less rows predate this requirement and keep pin_hash NULL.
async function registerUser({ name, email, phone, passwordHash, pinHash }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let userId;
    try {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, pin_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'user') RETURNING id`,
        [name, email || null, phone || null, passwordHash, pinHash || null]
      );
      userId = rows[0].id;
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err, "users_email_key") || isUniqueViolation(err, "users_email_unique")) {
        throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
      }
      if (isUniqueViolation(err, "users_phone_unique")) {
        throw new AppError(DUPLICATE_PHONE_MESSAGE, 409);
      }
      if (isUniqueViolation(err)) {
        const constraint = String(err.constraint || "");
        if (constraint.includes("phone")) throw new AppError(DUPLICATE_PHONE_MESSAGE, 409);
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
    return { id: userId, name, email: email || null, phone: phone || null, role: "user", balance: 0, pinSet: true, accountNumber };
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
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
            a.account_number, a.balance, a.currency
     FROM users u JOIN accounts a ON a.user_id = u.id
     ORDER BY u.id`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email || null,
    phone: r.phone || null,
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

// Self-deposit of simulated funds: idempotency claim + balance update +
// ledger insert in one transaction. Returns { body, status } on success,
// { replay } for a legitimate retry, or { error } when nothing was executed.
async function depositToAccount(userId, amountText, { idempotencyKey, fingerprint, displayAmount } = {}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (idempotencyKey) {
      const claim = await claimIdempotencyKey(client, {
        key: idempotencyKey, userId, endpoint: "POST /api/account/deposit", fingerprint,
      });
      if (claim.replay) {
        await client.query("ROLLBACK");
        return { replay: true, code: claim.code, body: claim.body };
      }
      if (claim.conflict) {
        await client.query("ROLLBACK");
        return { error: claim.conflict };
      }
    }
    const { rows } = await client.query(
      `SELECT a.id, a.account_number FROM accounts a WHERE a.user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return { error: { message: "User not found", status: 404 } };
    }
    const accountId = rows[0].id;
    const updated = await client.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance, account_number`,
      [amountText, accountId]
    );
    const ledger = await insertLedgerRow(client, {
      type: "deposit", senderId: null, receiverId: accountId, adminId: null,
      amountText, narration: null, feeText: "0.00",
    });
    // Same transaction: no notification without the committed deposit.
    await createNotification(client, {
      userId,
      eventType: "deposit_received",
      title: "Deposit received",
      message: `Your simulated deposit of ${nairaText(amountText)} is available. Ref ${ledger.reference}.`,
      reference: ledger.reference,
      destination: "/",
      dedupeKey: `deposit_received:${ledger.reference}`,
    });
    const body = {
      success: true,
      message: `Successfully deposited ${displayAmount} (simulated demo funds)`,
      newBalance: toNum(updated.rows[0].balance),
      reference: ledger.reference,
      fee: 0,
    };
    if (idempotencyKey) {
      await completeIdempotencyKey(client, { key: idempotencyKey, code: 200, body });
    }
    await client.query("COMMIT");
    return {
      body,
      status: 200,
      newBalance: body.newBalance,
      accountNumber: updated.rows[0].account_number,
      reference: ledger.reference,
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

// Admin credit: idempotency claim + lock recipient + SQL arithmetic + ledger
// insert in one transaction. Returns { body, status } on success, { replay }
// for a legitimate retry, or { error } when nothing was executed.
async function adminCredit({ adminId, accountNumber, amountText, narration, idempotencyKey, fingerprint, displayAmount }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (idempotencyKey) {
      const claim = await claimIdempotencyKey(client, {
        key: idempotencyKey, userId: adminId, endpoint: "POST /api/admin/credit", fingerprint,
      });
      if (claim.replay) {
        await client.query("ROLLBACK");
        return { replay: true, code: claim.code, body: claim.body };
      }
      if (claim.conflict) {
        await client.query("ROLLBACK");
        return { error: claim.conflict };
      }
    }
    const { rows } = await client.query(
      `SELECT a.id, u.id AS user_id, u.name FROM accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.account_number = $1 FOR UPDATE OF a`,
      [accountNumber]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return { error: { message: "Recipient account not found", status: 404 } };
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
    const ledger = await insertLedgerRow(client, {
      type: "admin_credit", senderId: null, receiverId: recipient.id, adminId,
      amountText, narration: narration || null, feeText: "0.00",
    });
    // Same transaction: the recipient is notified only if the credit commits.
    await createNotification(client, {
      userId: recipient.user_id,
      eventType: "admin_credit_received",
      title: "Simulated credit received",
      message: `Nairova added ${nairaText(amountText)} in simulated funds to your account${
        narration ? ` — ${narration}` : ""
      }. Ref ${ledger.reference}.`,
      reference: ledger.reference,
      destination: "/",
      dedupeKey: `admin_credit_received:${ledger.reference}`,
    });
    const transaction = {
      id: ledger.id,
      reference: ledger.reference,
      type: "admin_credit",
      senderId: adminId,
      senderAccountNumber: adminRow.account_number || null,
      adminEmail: adminRow.email || null,
      receiverId: recipient.user_id,
      receiverAccountNumber: accountNumber,
      amount: toNum(amountText),
      fee: 0,
      narration: narration || null,
      status: "success",
      timestamp: ledger.created_at,
    };
    const body = {
      success: true,
      message: `Credited ${displayAmount} (simulated funds) to ${recipient.name}`,
      data: {
        transaction,
        newBalance: toNum(updated.rows[0].balance),
      },
    };
    if (idempotencyKey) {
      await completeIdempotencyKey(client, { key: idempotencyKey, code: 200, body });
    }
    await client.query("COMMIT");
    return {
      body,
      status: 200,
      transaction,
      newBalance: body.data.newBalance,
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
// With an idempotency key, the key claim runs first inside the same
// transaction: replays return the stored outcome, mismatched payloads get a
// 409, and concurrent duplicates serialize on the key row.
async function transferFunds({ senderUserId, receiverAccountNumber, amountText, narration, idempotencyKey, fingerprint, displayAmount }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (idempotencyKey) {
      const claim = await claimIdempotencyKey(client, {
        key: idempotencyKey, userId: senderUserId, endpoint: "POST /api/transfer", fingerprint,
      });
      if (claim.replay) {
        await client.query("ROLLBACK");
        return { replay: true, code: claim.code, body: claim.body };
      }
      if (claim.conflict) {
        await client.query("ROLLBACK");
        return { error: claim.conflict };
      }
    }
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
    // The settled v1 transfer fee is zero; it is still recorded so receipts
    // and history show the real applied fee instead of inventing one later.
    const ledger = await insertLedgerRow(client, {
      type: "transfer", senderId: sender.id, receiverId: receiver.id, adminId: null,
      amountText, narration: narration || null, feeText: "0.00",
    });
    // Same transaction: both parties are notified only if the transfer commits.
    // Counterpart account numbers are already visible to both sides in history.
    await createNotification(client, {
      userId: senderUserId,
      eventType: "transfer_sent",
      title: "Transfer sent",
      message: `You sent ${nairaText(amountText)} to account ${receiver.account_number}. Ref ${ledger.reference}.`,
      reference: ledger.reference,
      destination: "/history",
      dedupeKey: `transfer_sent:${ledger.reference}`,
    });
    await createNotification(client, {
      userId: receiver.user_id,
      eventType: "transfer_received",
      title: "Transfer received",
      message: `You received ${nairaText(amountText)} from account ${sender.account_number}. Ref ${ledger.reference}.`,
      reference: ledger.reference,
      destination: "/history",
      dedupeKey: `transfer_received:${ledger.reference}`,
    });
    const body = {
      success: true,
      message: `Successfully transferred ${displayAmount} to ${receiver.name}`,
      newBalance: toNum(debited.rows[0].balance),
      reference: ledger.reference,
      fee: 0,
      narration: narration || null,
    };
    if (idempotencyKey) {
      await completeIdempotencyKey(client, { key: idempotencyKey, code: 200, body });
    }
    await client.query("COMMIT");
    return {
      body,
      status: 200,
      senderNewBalance: body.newBalance,
      receiverNewBalance: toNum(credited.rows[0].balance),
      receiverName: receiver.name,
      reference: ledger.reference,
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
  findUserByPhone,
  findUserByIdentifier,
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
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
};
