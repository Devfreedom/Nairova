const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError");
const { normalizeAmount } = require("../utils/money");
const { PASSWORD_REGEX, PASSWORD_REQUIREMENTS } = require("../utils/password");
const {
  listUsers,
  findUserById,
  updatePasswordHash,
  adminCredit: storeAdminCredit,
} = require("../db/store");

// Admin-only: list customers without exposing password/PIN hashes.
const listCustomers = async (req, res, next) => {
  try {
    const customers = await listUsers();
    res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (err) {
    next(err);
  }
};

// Admin-only: credit a customer with simulated demo funds.
// Executes as one database transaction and reports the persisted balance.
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

    const result = await storeAdminCredit({
      adminId: req.user.id,
      accountNumber: String(accountNumber).trim(),
      amountText: amount.toFixed(2),
    });

    if (!result) {
      throw new AppError("Recipient account not found", 404);
    }

    res.status(200).json({
      success: true,
      message: `Credited ${amount} (simulated funds) to ${result.recipientName}`,
      data: {
        transaction: result.transaction,
        newBalance: result.newBalance,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Admin-only: reset a customer's forgotten password.
// Only the stored bcrypt hash changes; account number, balance, PIN, role,
// and transaction history are left untouched.
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

    const target = await findUserById(id);
    if (!target) {
      throw new AppError("Customer account not found", 404);
    }

    if (target.role === "admin") {
      throw new AppError("Only customer passwords can be reset through this endpoint", 403);
    }

    await updatePasswordHash(target.id, await bcrypt.hash(newPassword, 10));

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${target.name}`,
      data: {
        id: target.id,
        name: target.name,
        email: target.email,
        phone: target.phone,
        accountNumber: target.accountNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listCustomers, creditAccount, resetCustomerPassword };
