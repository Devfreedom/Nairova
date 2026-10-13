const { users, transactions, getNextId } = require("../data/users");
const AppError = require("../utils/AppError");
const { normalizeAmount } = require("../utils/money");
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

module.exports = { listCustomers, creditAccount };
