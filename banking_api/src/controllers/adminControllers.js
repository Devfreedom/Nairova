const { users, transactions, getNextId } = require("../data/users");
const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError");
const { normalizeAmount } = require("../utils/money");
const { PASSWORD_REGEX, PASSWORD_REQUIREMENTS } = require("../utils/password");
const { sanitizeUser } = require("./accountControllers");

// Admin-only: list customers without exposing password/PIN hashes.
const listCustomers = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: users.map(sanitizeUser),
    });
  } catch (err) {
    next(err);
  }
};

// Admin-only: credit a customer with simulated demo funds.
// Records admin identity, recipient, amount, operation type, timestamp, status.
const creditAccount = async (req, res, next) => {
  try {
    const { accountNumber, amount: rawAmount } = req.body;

    if (!accountNumber || String(accountNumber).trim() === "") {
      throw new AppError("Recipient account number is required", 400);
    }

    const parsed = normalizeAmount(rawAmount);
    if (!parsed.ok) {
      throw new AppError(parsed.error, 400);
    }
    const amount = parsed.value;

    const recipient = users.find((u) => u.accountNumber === String(accountNumber).trim());
    if (!recipient) {
      throw new AppError("Recipient account not found", 404);
    }

    recipient.balance = Math.round((recipient.balance + amount) * 100) / 100;

    const record = {
      id: getNextId(),
      type: "admin_credit",
      senderId: req.user.id,
      senderAccountNumber: req.user.accountNumber || null,
      adminEmail: req.user.email,
      receiverId: recipient.id,
      receiverAccountNumber: recipient.accountNumber,
      amount,
      status: "success",
      timestamp: new Date(),
    };
    transactions.push(record);

    res.status(200).json({
      success: true,
      message: `Credited ${amount} (simulated funds) to ${recipient.name}`,
      data: {
        transaction: record,
        newBalance: recipient.balance,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listCustomers, creditAccount, resetCustomerPassword };

// Admin-only: reset a customer's forgotten password.
// Identifies the target by unambiguous user ID. Only the bcrypt hash is stored;
// account number, balance, PIN, role, and history are left untouched.
const resetCustomerPassword = async (req, res, next) => {
  try {
    const { userId, newPassword, confirmPassword } = req.body || {};

    const id = typeof userId === "string" && userId.trim() !== "" ? Number(userId) : userId;
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("A valid customer user ID is required", 400);
    }

    if (typeof newPassword !== "string" || !PASSWORD_REGEX.test(newPassword)) {
      throw new AppError(PASSWORD_REQUIREMENTS, 400);
    }

    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      throw new AppError("Password confirmation does not match", 400);
    }

    const target = users.find((u) => u.id === id);
    if (!target) {
      throw new AppError("Customer account not found", 404);
    }

    if (target.role === "admin") {
      throw new AppError("Only customer passwords can be reset through this endpoint", 403);
    }

    target.password = await bcrypt.hash(newPassword, 10);

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${target.name}`,
      data: {
        id: target.id,
        name: target.name,
        email: target.email,
        accountNumber: target.accountNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};
