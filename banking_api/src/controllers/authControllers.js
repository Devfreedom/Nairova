const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const { findUserByIdentifier } = require("../db/store");
const { registerUser } = require("../db/store");

const jwtExpiresIn = process.env.JWT_EXPIRES_IN || process.env.JwT_EXPIRES_IN || "1h"

function jwtSecretOrThrow() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("Server misconfigured: authentication unavailable", 500);
  }
  return secret;
}

const register = async (req, res, next) => {
    try {
        const { name, email, phone, password } = req.body;

        // Public registration always creates an ordinary user.
        // The role field from the client is intentionally ignored.
        // Identifier normalization happens in validateRegister; uniqueness is
        // enforced by the database constraints.

        const hashedPassword = await bcrypt.hash(password, 10);
        const created = await registerUser({ name, email, phone, passwordHash: hashedPassword });

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: created
        });
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { identifier, identifierKind, email, password } = req.body;
        const kind = identifierKind === "phone" ? "phone" : "email";
        const value = typeof identifier === "string" ? identifier : email;

        const user = await findUserByIdentifier({ kind, value });
        const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!user || !passwordMatches) {
            throw new AppError("Invalid email/phone number or password", 401)
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            jwtSecretOrThrow(),
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
