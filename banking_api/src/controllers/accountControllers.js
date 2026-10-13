const { users, transactions, getNextId } = require("../data/users");
const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError")
const { normalizeAmount } = require("../utils/money");

const sanitizeUser = (user) => {
  const { password, pin, ...safe } = user;
  return safe;
};

const getBalance = async (req, res, next) => {
    try {
        const user = users.find((u) => u.id === req.user.id);
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

        const user = users.find((u) => u.id === req.user.id);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.pin) {
            throw new AppError('PIN already set. Use update instead.', 400);
        }

        const hashedPin = await bcrypt.hash(String(pin), 10);
        user.pin = hashedPin;

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

    const user = users.find((u) => u.id === req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.pin) {
      throw new AppError('No PIN set yet. Use create instead.', 400);
    }

    const isMatch = await bcrypt.compare(String(oldPin), user.pin);

    if (!isMatch) {
      throw new AppError('Old PIN is incorrect', 403);
    }

    const hashedPin = await bcrypt.hash(String(newPin), 10);
    user.pin = hashedPin;

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

    const user = users.find((u) => u.id === req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.balance = Math.round((user.balance + amount) * 100) / 100;

    const newTransaction = {
      id: getNextId(),
      type: 'deposit',
      senderId: null,
      senderAccountNumber: null,
      receiverId: user.id,
      receiverAccountNumber: user.accountNumber,
      amount,
      status: 'success',
      timestamp: new Date(),
    };
    transactions.push(newTransaction);

    res.status(200).json({
      success: true,
      message: `Successfully deposited ${amount} (simulated demo funds)`,
      newBalance: user.balance,
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

        const account = users.find((u) => u.accountNumber === receiverAccountNumber);

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
    res.status(200).json({
      success: true,
      users: users.map(sanitizeUser),
    });
  } catch (err) {
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const user = users.find((u) => u.id === req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    // Admins may review all records for the demo; customers see only their own.
    const own = req.user.role === "admin"
      ? [...transactions]
      : transactions.filter((t) => t.senderId === user.id || t.receiverId === user.id);
    own.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.status(200).json({
      success: true,
      data: own,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBalance, createPin, updatePin, deposit, verifyAccount, getAllUsers, getTransactions, sanitizeUser };
