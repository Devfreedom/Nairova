const AppError = require('../utils/AppError');
const bcrypt = require('bcrypt');
const { normalizeAmount, TRANSFER_MIN_AMOUNT, TRANSFER_MAX_AMOUNT } = require('../utils/money');
const { validateIdempotencyKey, normalizeNarration, fingerprint } = require('../utils/ledger');
const { findUserById, transferFunds } = require('../db/store');

const transfer = async (req, res, next) => {
  try {
    const { receiverAccountNumber, amount: rawAmount, pin, narration: rawNarration, idempotencyKey: rawKey } = req.body;

    const parsed = normalizeAmount(rawAmount);
    if (!parsed.ok) {
      throw new AppError(parsed.error, 400);
    }
    const amount = parsed.value;

    // Settled v1 transfer bounds. Checked here (not in normalizeAmount) so
    // deposits and admin credits keep their wider approved cap.
    if (amount < TRANSFER_MIN_AMOUNT) {
      throw new AppError(`Transfer amount must be at least ₦${TRANSFER_MIN_AMOUNT}`, 400);
    }
    if (amount > TRANSFER_MAX_AMOUNT) {
      throw new AppError(`Transfer amount must not exceed ₦${TRANSFER_MAX_AMOUNT.toLocaleString("en-NG")} per transfer`, 400);
    }

    const narrationParsed = normalizeNarration(rawNarration);
    if (!narrationParsed.ok) {
      throw new AppError(narrationParsed.error, 400);
    }

    const keyParsed = validateIdempotencyKey(rawKey);
    if (!keyParsed.ok) {
      throw new AppError(keyParsed.error, 400);
    }

    if (!receiverAccountNumber || String(receiverAccountNumber).trim() === '') {
      throw new AppError('Receiver account Number is required', 400);
    }
    const receiver = String(receiverAccountNumber).trim();

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

    if (sender.accountNumber === receiver) {
      throw new AppError('You cannot transfer to yourself', 400);
    }

    if (sender.balance < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    const amountText = amount.toFixed(2);
    // Atomic debit + credit + ledger insert; the conditional debit inside the
    // transaction guards against concurrent overdrafts.
    const result = await transferFunds({
      senderUserId: sender.id,
      receiverAccountNumber: receiver,
      amountText,
      narration: narrationParsed.narration,
      idempotencyKey: keyParsed.key,
      fingerprint: fingerprint(["transfer", String(sender.id), amountText, receiver, narrationParsed.narration || "", "0.00"]),
      displayAmount: amount,
    });

    if (result.replay) {
      return res.status(result.code).json(result.body);
    }

    if (result.error) {
      throw new AppError(result.error.message, result.error.status);
    }

    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
};

module.exports = { transfer };
