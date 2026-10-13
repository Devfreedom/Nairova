const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError");
const { normalizeAmount } = require("../utils/money");
const { validateIdempotencyKey, normalizeNarration, fingerprint } = require("../utils/ledger");
const { normalizePhone, isValidPhone } = require("../utils/identifier");
const {
  getCatalogue,
  isSupportedNetwork,
  getBundle,
  BUNDLES,
  NETWORKS,
  AIRTIME_MIN_AMOUNT,
  AIRTIME_MAX_AMOUNT,
} = require("../utils/topupCatalogue");
const { findUserById, purchaseTopup } = require("../db/store");

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

// Rejects any property outside the endpoint's allowlist. In particular a
// client-supplied price (or bundle/amount field where it does not belong)
// is never silently ignored: the request fails instead.
function assertExactFields(body, allowed, what) {
  const extra = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw new AppError(
      `Invalid ${what} request: unexpected field${extra.length > 1 ? "s" : ""} (${extra.join(", ")}). Prices are set by the server.`,
      400
    );
  }
}

function validateNetwork(rawNetwork) {
  const network = typeof rawNetwork === "string" ? rawNetwork.trim() : "";
  if (!isSupportedNetwork(network)) {
    throw new AppError(`Network must be one of: ${NETWORKS.join(", ")}`, 400);
  }
  return network;
}

// normalizePhone accepts local spellings; isValidPhone enforces the
// Nigerian E.164 rule on the normalized value. Both must pass.
function validateMsisdn(rawMsisdn) {
  if (typeof rawMsisdn !== "string" || rawMsisdn.trim() === "") {
    throw new AppError("Recipient phone number is required", 400);
  }
  const normalized = normalizePhone(rawMsisdn);
  if (!normalized || !isValidPhone(normalized)) {
    throw new AppError("Enter a valid Nigerian mobile number (e.g. 08012345678)", 400);
  }
  return normalized;
}

function validateAirtimeAmount(rawAmount) {
  const parsed = normalizeAmount(rawAmount);
  if (!parsed.ok) {
    throw new AppError(parsed.error, 400);
  }
  const amount = parsed.value;
  if (amount < AIRTIME_MIN_AMOUNT) {
    throw new AppError(`Airtime amount must be at least ₦${AIRTIME_MIN_AMOUNT}`, 400);
  }
  if (amount > AIRTIME_MAX_AMOUNT) {
    throw new AppError(`Airtime amount must not exceed ₦${AIRTIME_MAX_AMOUNT.toLocaleString("en-NG")}`, 400);
  }
  return amount;
}

function validateKey(rawKey) {
  const keyParsed = validateIdempotencyKey(rawKey);
  if (!keyParsed.ok) {
    throw new AppError(keyParsed.error, 400);
  }
  if (!keyParsed.key) {
    throw new AppError("Idempotency key is required", 400);
  }
  return keyParsed.key;
}

async function validatePinOwner(req, rawPin) {
  if (rawPin === undefined || rawPin === null || String(rawPin) === "") {
    throw new AppError("Your transaction pin is required", 400);
  }
  const buyer = await findUserById(req.user.id);
  if (!buyer) {
    throw new AppError("Account not found", 404);
  }
  if (!buyer.pinHash) {
    throw new AppError("You must create a PIN before making purchases", 400);
  }
  const isPinValid = await bcrypt.compare(String(rawPin), buyer.pinHash);
  if (!isPinValid) {
    throw new AppError("Incorrect PIN", 403);
  }
  return buyer;
}

const purchaseAirtime = async (req, res, next) => {
  try {
    assertExactFields(
      req.body,
      ["recipientMsisdn", "network", "amount", "narration", "pin", "idempotencyKey"],
      "airtime"
    );
    const {
      recipientMsisdn: rawMsisdn,
      network: rawNetwork,
      amount: rawAmount,
      narration: rawNarration,
      pin,
      idempotencyKey: rawKey,
    } = req.body || {};

    const network = validateNetwork(rawNetwork);
    const msisdn = validateMsisdn(rawMsisdn);
    const amount = validateAirtimeAmount(rawAmount);

    const narrationParsed = normalizeNarration(rawNarration);
    if (!narrationParsed.ok) {
      throw new AppError(narrationParsed.error, 400);
    }

    const idempotencyKey = validateKey(rawKey);
    const buyer = await validatePinOwner(req, pin);

    if (buyer.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    const amountText = amount.toFixed(2);
    const result = await purchaseTopup({
      userId: buyer.id,
      kind: "airtime",
      network,
      msisdn,
      amountText,
      narration: narrationParsed.narration,
      bundle: null,
      endpoint: "POST /api/topup/airtime",
      idempotencyKey,
      fingerprint: fingerprint([
        "topup_airtime",
        String(buyer.id),
        amountText,
        network,
        msisdn,
        narrationParsed.narration || "",
        "0.00",
      ]),
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

// Data is priced strictly from the server catalogue: the client selects a
// (network, bundleCode) pair and the charge is the catalogue price. Any
// client-supplied amount or price is rejected outright by the field
// allowlist above, never read.
const purchaseData = async (req, res, next) => {
  try {
    assertExactFields(
      req.body,
      ["recipientMsisdn", "network", "bundleCode", "pin", "idempotencyKey"],
      "data"
    );
    const {
      recipientMsisdn: rawMsisdn,
      network: rawNetwork,
      bundleCode: rawCode,
      pin,
      idempotencyKey: rawKey,
    } = req.body || {};

    const network = validateNetwork(rawNetwork);
    const msisdn = validateMsisdn(rawMsisdn);

    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    if (code === "") {
      throw new AppError("Bundle code is required", 400);
    }
    const bundle = getBundle(network, code);
    if (!bundle) {
      const elsewhere = BUNDLES.find((b) => b.code === code);
      if (elsewhere) {
        throw new AppError(`Bundle ${code} belongs to ${elsewhere.network}, not ${network}`, 400);
      }
      throw new AppError(`Unknown bundle code for ${network}`, 400);
    }
    const priceText = bundle.price.toFixed(2);

    const idempotencyKey = validateKey(rawKey);
    const buyer = await validatePinOwner(req, pin);

    if (buyer.balance < bundle.price) {
      throw new AppError("Insufficient balance", 400);
    }

    const result = await purchaseTopup({
      userId: buyer.id,
      kind: "data",
      network,
      msisdn,
      amountText: priceText,
      narration: null,
      bundle: { code: bundle.code, name: bundle.name, allowance: bundle.allowance, validity: bundle.validity },
      endpoint: "POST /api/topup/data",
      idempotencyKey,
      fingerprint: fingerprint([
        "topup_data",
        String(buyer.id),
        priceText,
        network,
        msisdn,
        bundle.code,
        "0.00",
      ]),
      displayAmount: bundle.price,
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
