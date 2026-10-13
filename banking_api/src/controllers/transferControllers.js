const { users, transactions, getNextId } = require('../data/users');
const AppError = require('../utils/AppError');
const bcrypt = require('bcrypt');
const { normalizeAmount } = require('../utils/money');

const transfer = async (req, res, next) => {
  try {
    const { receiverAccountNumber, amount: rawAmount, pin } = req.body;

    const parsed = normalizeAmount(rawAmount);
    if (!parsed.ok) {
      throw new AppError(parsed.error, 400);
    }
    const amount = parsed.value;

    if (!receiverAccountNumber || String(receiverAccountNumber).trim() === '') {
      throw new AppError('Receiver account Number is required', 400);
    }

    if (pin === undefined || pin === null || String(pin) === '') {
      throw new AppError ('Your transaction pin is required', 400)
    }

    const sender = users.find((u) => u.id === req.user.id);
    if (!sender) {
      throw new AppError('Sender not found', 404);
    }

    const receiver = users.find((u) => u.accountNumber === String(receiverAccountNumber).trim());
    if (!receiver) {
      throw new AppError('Receiver not found', 404);
    }

    if (sender.id === receiver.id) {
      throw new AppError('You cannot transfer to yourself', 400);
    }

    if (!sender.pin) {
      throw new AppError('You must create a PIN before making transfers', 400);
    }

    const isPinValid = await bcrypt.compare(String(pin), sender.pin);
    if (!isPinValid) {
      throw new AppError('Incorrect PIN', 403);
    }

    if (sender.balance < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    // All validation passed — update balances atomically for in-memory store.
    sender.balance = Math.round((sender.balance - amount) * 100) / 100;
    receiver.balance = Math.round((receiver.balance + amount) * 100) / 100;

    const newTransaction = {
      id: getNextId(),
      type: 'transfer',
      senderId: sender.id,
      senderAccountNumber: sender.accountNumber,
      receiverId: receiver.id,
      receiverAccountNumber: receiver.accountNumber,
      amount,
      status: 'success',
      timestamp: new Date(),
    };
    transactions.push(newTransaction);

    res.status(200).json({
      success: true,
      message: `Successfully transferred ${amount} to ${receiver.name}`,
      newBalance: sender.balance,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { transfer };
