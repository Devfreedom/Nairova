const { getCatalogue } = require("../utils/topupCatalogue");

// Stage 1: catalogue read only. No money movement, no purchase execution.
// The catalogue is server-authoritative: the frontend displays these
// values and the purchase endpoints (Stage 2/3) will price from the same
// module, never from client input.
function getTopupCatalogue(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      message: "Top-up catalogue",
      data: getCatalogue(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTopupCatalogue };
