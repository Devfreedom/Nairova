const bcrypt = require("bcrypt");
const users = require("../data/users");
const jwt = require("jsonwebtoken");

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

        const {password: _removed, ...safeUser} = newUser;

        res.status(201).json({
            success: true, 
            message: "User registered successfully",
            data: safeUser
        });
    } catch(err){
        next(err);
    }
};

const login = async (req, res , next) => {
    
}