const { users } = require("../data/users");
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

module.exports = { getBalance, createPin };