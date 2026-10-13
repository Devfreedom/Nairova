const { users, transactions, getNextId } = require('../data/users'); // ⚠️ confirm transactions is exported from users.js
const AppError = require('../utils/AppError');
const bcrypt = require('bcrypt');

const transfer = async (req, res, next) => {
  try {
    const { receiverAccountNumber, amount, pin } = req.body;

    
    if (!amount || amount <= 0) {
      throw new AppError('Amount must be greater than zero', 400);
    }

    if (!receiverAccountNumber) {
      throw new AppError('Receiver account Number is required', 400);
    }
    
    if (!pin) {
      throw new AppError ('Your transaction pin is required', 400)
    }
    
    const sender = users.find((u) => u.id === req.user.id);
    if (!sender) {
      throw new AppError('Sender not found', 404);
    }

  
    const receiver = users.find((u) => u.accountNumber === receiverAccountNumber);
    if (!receiver) {
      throw new AppError('Receiver not found', 404);
    }

    
    if (sender.id === receiver.id) {
      throw new AppError('You cannot transfer to yourself', 400);
    }

    
    if (!sender.pin) {
      throw new AppError('You must create a PIN before making transfers', 400);
    }

 
    const isPinValid = await bcrypt.compare(pin, sender.pin);
    if (!isPinValid) {
      throw new AppError('Incorrect PIN', 403);
    }

    
    if (sender.balance < amount) {
      throw new AppError('Insufficient balance', 400);
    }

   
    sender.balance -= amount;
    receiver.balance += amount;

    
    const newTransaction = {
      id: getNextId(),
      senderId: sender.id,
      receiverId: receiver.id,
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