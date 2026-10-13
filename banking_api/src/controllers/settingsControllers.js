const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError");
const {
  findUserById,
  updateProfile,
  updatePasswordHash,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  getPreferences,
  updatePreferences,
} = require("../db/store");

const isProduction = () => process.env.NODE_ENV === "production";

// Self-service profile edit. Owner-scoped by the session id; email changes
// (or clearing a verified address) reset verification. Phone-only accounts
// stay valid as long as at least one identifier remains.
const patchProfile = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    const patch = req.profilePatch || {};
    const name = patch.name !== undefined ? patch.name : user.name;
    const email = patch.email !== undefined ? patch.email : user.email;
    const phone = patch.phone !== undefined ? patch.phone : user.phone;
    if (!email && !phone) {
      throw new AppError("At least one of email or phone number is required", 400);
    }
    const emailChanged =
      patch.email !== undefined && (patch.email !== user.email || (patch.email === null && user.emailVerified));
    const updated = await updateProfile(req.user.id, { name, email, phone, emailChanged });
    if (!updated) {
      throw new AppError("User not found", 404);
    }
    res.status(200).json({
      success: true,
      message: emailChanged ? "Profile updated. Email verification was reset." : "Profile updated",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Issues a verification token for the user's current email. Idempotent when
// already verified. No mail provider is configured, so nothing is delivered:
// the token is returned only outside production (dev/test affordance) and
// never appears in production responses.
const requestEmailVerification = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (!user.email) {
      throw new AppError("Add an email address to your profile first", 400);
    }
    if (user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: "Email is already verified",
        data: { verificationSent: false, alreadyVerified: true },
      });
    }
    const token = await createEmailVerificationToken(user.id, user.email);
    const data = { verificationSent: false, reason: "no-mail-provider" };
    if (!isProduction()) {
      data.verificationToken = token;
    }
    res.status(200).json({
      success: true,
      message: "Verification token created. No mail provider is configured, so no email was sent.",
      data,
    });
  } catch (err) {
    next(err);
  }
};

// Consumes a token. Unknown, used, expired, or wrong-address tokens all fail
// with the same message so tokens cannot be probed.
const verifyEmail = async (req, res, next) => {
  try {
    const result = await consumeEmailVerificationToken(req.user.id, req.body.token);
    if (!result.ok) {
      throw new AppError("Invalid or expired verification code", 400);
    }
    res.status(200).json({
      success: true,
      message: `Email ${result.email} verified`,
      data: { email: result.email, emailVerified: true },
    });
  } catch (err) {
    next(err);
  }
};

const getPrefs = async (req, res, next) => {
  try {
    const prefs = await getPreferences(req.user.id);
    res.status(200).json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
};

// Email opt-ins require a verified address; everything else applies freely.
// Unknown keys are already rejected by validatePreferences.
const patchPrefs = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (
      (req.body.emailMoneyEvents === true || req.body.emailMarketing === true) &&
      !(user.email && user.emailVerified)
    ) {
      throw new AppError("Verify your email address before enabling email notifications", 400);
    }
    const patch = {};
    for (const key of ["inappMoneyEvents", "emailMoneyEvents", "emailMarketing", "theme"]) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const updated = await updatePreferences(req.user.id, patch);
    res.status(200).json({ success: true, message: "Preferences updated", data: updated });
  } catch (err) {
    next(err);
  }
};

// Self-service password change. The current password is verified against the
// stored bcrypt hash; existing sessions keep working (same as admin reset).
const changePassword = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    const matches = await bcrypt.compare(String(req.body.currentPassword), user.passwordHash);
    if (!matches) {
      throw new AppError("Current password is incorrect", 403);
    }
    await updatePasswordHash(user.id, await bcrypt.hash(req.body.newPassword, 10));
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};

module.exports = { patchProfile, requestEmailVerification, verifyEmail, getPrefs, patchPrefs, changePassword };
