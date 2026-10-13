const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError")
const { normalizeAmount } = require("../utils/money");
const {
  findUserById,
  setPinHash,
  listUsers,
  findAccountByNumber,
  transactionsForUser,
  allTransactions,
  depositToAccount,
} = require("../db/store");

const getBalance = async (req, res, next) => {
    try {
        const user = await findUserById(req.user.id);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        res.status(200).json({
            success: true,
            balance: user.balance,
        });

    } catch (err) {
        next(err);
    }
};

const createPin = async (req, res, next) => {
    try {
        const { pin } = req.body;

        if (!pin || !/^\d{4}$/.test(String(pin))) {
            throw new AppError('PIN must be exactly 4 digits', 400);
        }

        const user = await findUserById(req.user.id);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.pinHash) {
            throw new AppError('PIN already set. Use update instead.', 400);
        }

        const hashedPin = await bcrypt.hash(String(pin), 10);
        await setPinHash(user.id, hashedPin);

        res.status(201).json({
            success: true,
            message: 'PIN created successfully',
        });
    } catch (err) {
        next(err);
    }
};

const updatePin = async (req, res, next) => {
  try {
    const { oldPin, newPin } = req.body;

    if (!oldPin || !newPin || !/^\d{4}$/.test(String(newPin))) {
      throw new AppError('Old PIN and a valid new 4-digit PIN are required', 400);
    }

    const user = await findUserById(req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.pinHash) {
      throw new AppError('No PIN set yet. Use create instead.', 400);
    }

    const isMatch = await bcrypt.compare(String(oldPin), user.pinHash);

    if (!isMatch) {
      throw new AppError('Old PIN is incorrect', 403);
    }

    const hashedPin = await bcrypt.hash(String(newPin), 10);
    await setPinHash(user.id, hashedPin);

    res.status(200).json({
      success: true,
      message: 'PIN updated successfully',
    });
  } catch (err) {
    next(err);
  }
};

const deposit = async (req, res, next) => {
  try {
    const { amount: rawAmount } = req.body;

    const parsed = normalizeAmount(rawAmount);
    if (!parsed.ok) {
      throw new AppError(parsed.error, 400);
    }
    const amount = parsed.value;

    const result = await depositToAccount(req.user.id, amount.toFixed(2));

    if (!result) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      message: `Successfully deposited ${amount} (simulated demo funds)`,
      newBalance: result.newBalance,
    });
  } catch (err) {
    next(err);
  }
};

const verifyAccount = async (req, res, next) => {
    try {
        const receiverAccountNumber = String(req.params.accountNumber || "").trim();

        if (!receiverAccountNumber) {
            throw new AppError('Receiver account number is required', 400);
        }

        const account = await findAccountByNumber(receiverAccountNumber);

        if (!account) {
            throw new AppError('Receiver account not found', 404)
        }

        // Only expose non-sensitive recipient details needed for confirmation.
        res.status(200).json({
            success: true,
            message: 'Account verified',
            data: {
                name: account.name,
                accountNumber: account.accountNumber,
            }
        })
    } catch (err) {
        next(err);
    }
}

const getAllUsers = async (req, res, next) => {
  try {
    const customers = await listUsers();
    res.status(200).json({
      success: true,
      users: customers,
    });
  } catch (err) {
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    // Admins may review all records for the demo; customers see only their own.
    const records = req.user.role === "admin"
      ? await allTransactions()
      : await transactionsForUser(user.id);
    res.status(200).json({
      success: true,
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBalance, createPin, updatePin, deposit, verifyAccount, getAllUsers, getTransactions };
