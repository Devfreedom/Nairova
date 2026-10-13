const bcrypt = require("bcrypt");
const {users, getNextId} = require("../data/users");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || process.env.JwT_EXPIRES_IN || "1h"

const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Public registration always creates an ordinary user.
        // The role field from the client is intentionally ignored.

        const emailExists = users.find((user) => user.email === email);
        if (emailExists) {
            throw new AppError("Email is already registered", 409);
        }

        const generateAccountNumber = () => {
  // Generates a random 10-digit Accountnumber,
  let accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  return accountNumber;
};

    let accountNumber;
    do {
      accountNumber = generateAccountNumber();
    } while (users.find((user) => user.accountNumber === accountNumber));


        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: getNextId(),
            name,
            email,
            password: hashedPassword,
            role: "user",
            balance: 0,
            pin: null,
            accountNumber
        };
        users.push(newUser);

        const { password: _removed, ...safeUser } = newUser;

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: safeUser
        });
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = users.find((u) => u.email === email);
        const passwordMatches = user ? await bcrypt.compare(password, user.password) : false;
        if (!user || !passwordMatches) {
            throw new AppError("Invalid email or password", 401)
        }

        if (!jwtSecret) {
            throw new AppError("Server misconfigured: authentication unavailable", 500);
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            jwtSecret,
            { expiresIn: jwtExpiresIn }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token
        })
    } catch (err) {
        next(err)
    }
};


module.exports = { register, login }