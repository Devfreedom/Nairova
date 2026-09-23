const { users, transactions, getNextId } = require("../data/users");
const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError")

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

        if (!pin || !/^\d{4}$/.test(pin)) {
            throw new AppError('PIN must be exactly 4 digits', 400);
        }

        const user = users.find((u) => u.id === req.user.id);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.pin) {
            throw new AppError('PIN already set. Use update instead.', 400);
        }

        const hashedPin = await bcrypt.hash(pin, 10);
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

    if (!oldPin || !newPin || !/^\d{4}$/.test(newPin)) {
      throw new AppError('Old PIN and a valid new 4-digit PIN are required', 400);
    }

    const user = users.find((u) => u.id === req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.pin) {
      throw new AppError('No PIN set yet. Use create instead.', 400);
    }

    const isMatch = await bcrypt.compare(oldPin, user.pin);

    if (!isMatch) {
      throw new AppError('Old PIN is incorrect', 403);
    }

    const hashedPin = await bcrypt.hash(newPin, 10);
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
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    const user = users.find((u) => u.id === req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.balance += amount;

    const newTransaction = {
      id: getNextId(),
      type: 'deposit',
      receiverId: user.id,
      amount,
      status: 'success',
      timestamp: new Date(),
    };
    transactions.push(newTransaction);

    res.status(200).json({
      success: true,
      message: `Successfully deposited ${amount}`,
      newBalance: user.balance,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBalance, createPin, updatePin, deposit };