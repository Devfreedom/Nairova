const users = require("../data/users");

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

module.exports = { getBalance };