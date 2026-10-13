const AppError = require('../utils/AppError');
const bcrypt = require('bcrypt');
const { normalizeAmount } = require('../utils/money');
const { findUserById, transferFunds } = require('../db/store');

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

    const sender = await findUserById(req.user.id);
    if (!sender) {
      throw new AppError('Sender not found', 404);
    }

    if (!sender.pinHash) {
      throw new AppError('You must create a PIN before making transfers', 400);
    }

    const isPinValid = await bcrypt.compare(String(pin), sender.pinHash);
    if (!isPinValid) {
      throw new AppError('Incorrect PIN', 403);
    }

    if (sender.accountNumber === String(receiverAccountNumber).trim()) {
      throw new AppError('You cannot transfer to yourself', 400);
    }

    if (sender.balance < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    // Atomic debit + credit + ledger insert; the conditional debit inside the
    // transaction guards against concurrent overdrafts.
    const result = await transferFunds({
      senderUserId: sender.id,
      receiverAccountNumber: String(receiverAccountNumber).trim(),
      amountText: amount.toFixed(2),
    });

    if (result.error) {
      throw new AppError(result.error.message, result.error.status);
    }

    res.status(200).json({
      success: true,
      message: `Successfully transferred ${amount} to ${result.receiverName}`,
      newBalance: result.senderNewBalance,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { transfer };
