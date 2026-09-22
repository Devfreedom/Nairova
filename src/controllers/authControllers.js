const bcrypt = require("bcrypt");
const users = require("../data/users");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "1h"

const register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        const emailExists = users.find((user) => user.email === email);
        if (emailExists) {
            throw new AppError("Email is already registered", 409);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: users.getNextId(),
            name,
            email,
            password,
            role,
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
        throw new AppError("Invalid password", 401)
      }

const token = jwt.sign(
    {id: user.id, email: user.email, role: user.role},
    jwtSecret,
    {expiresIn: jwtExpiresIn}
);
    }
}


module.exports = { register, login }