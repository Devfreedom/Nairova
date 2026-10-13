// Versioned server-side catalogue for simulated airtime/data (Phase 3).
// These are simulated in-app packages: not claims about real telecom
// tariffs, and no real delivery occurs. Prices are authoritative here;
// the frontend must never supply or override a price. Admin-managed
// editing is out of scope: price changes ship as a code edit plus a
// CATALOGUE_VERSION bump. Per-purchase snapshots in the purchases table
// keep history immutable across catalogue changes.
const CATALOGUE_VERSION = 1;

const NETWORKS = Object.freeze(["MTN", "Airtel", "Glo", "9mobile"]);

// Agreed airtime presets plus approved custom bounds (inclusive).
const AIRTIME_PRESETS = Object.freeze([200, 500, 1000, 2000, 5000, 10000]);
const AIRTIME_MIN_AMOUNT = 100;
const AIRTIME_MAX_AMOUNT = 10000;

const BUNDLES = Object.freeze([
  Object.freeze({ code: "MTN-500MB-7D", network: "MTN", name: "MTN 500MB Weekly", allowance: "500 MB", validity: "7 days", price: 350 }),
  Object.freeze({ code: "MTN-1P5GB-30D", network: "MTN", name: "MTN 1.5GB Monthly", allowance: "1.5 GB", validity: "30 days", price: 1000 }),
  Object.freeze({ code: "MTN-4P5GB-30D", network: "MTN", name: "MTN 4.5GB Monthly", allowance: "4.5 GB", validity: "30 days", price: 2000 }),
  Object.freeze({ code: "MTN-11GB-30D", network: "MTN", name: "MTN 11GB Monthly", allowance: "11 GB", validity: "30 days", price: 3500 }),
  Object.freeze({ code: "MTN-25GB-30D", network: "MTN", name: "MTN 25GB Monthly", allowance: "25 GB", validity: "30 days", price: 6500 }),
  Object.freeze({ code: "ATL-500MB-7D", network: "Airtel", name: "Airtel 500MB Weekly", allowance: "500 MB", validity: "7 days", price: 350 }),
  Object.freeze({ code: "ATL-1P5GB-30D", network: "Airtel", name: "Airtel 1.5GB Monthly", allowance: "1.5 GB", validity: "30 days", price: 1000 }),
  Object.freeze({ code: "ATL-5GB-30D", network: "Airtel", name: "Airtel 5GB Monthly", allowance: "5 GB", validity: "30 days", price: 2000 }),
  Object.freeze({ code: "ATL-12GB-30D", network: "Airtel", name: "Airtel 12GB Monthly", allowance: "12 GB", validity: "30 days", price: 3500 }),
  Object.freeze({ code: "ATL-30GB-30D", network: "Airtel", name: "Airtel 30GB Monthly", allowance: "30 GB", validity: "30 days", price: 7000 }),
  Object.freeze({ code: "GLO-1GB-14D", network: "Glo", name: "Glo 1GB Biweekly", allowance: "1 GB", validity: "14 days", price: 500 }),
  Object.freeze({ code: "GLO-3GB-30D", network: "Glo", name: "Glo 3GB Monthly", allowance: "3 GB", validity: "30 days", price: 1000 }),
  Object.freeze({ code: "GLO-7GB-30D", network: "Glo", name: "Glo 7GB Monthly", allowance: "7 GB", validity: "30 days", price: 2000 }),
  Object.freeze({ code: "GLO-15GB-30D", network: "Glo", name: "Glo 15GB Monthly", allowance: "15 GB", validity: "30 days", price: 3500 }),
  Object.freeze({ code: "GLO-32GB-90D", network: "Glo", name: "Glo 32GB Quarterly", allowance: "32 GB", validity: "90 days", price: 10000 }),
  Object.freeze({ code: "9M-1GB-7D", network: "9mobile", name: "9mobile 1GB Weekly", allowance: "1 GB", validity: "7 days", price: 500 }),
  Object.freeze({ code: "9M-2P5GB-30D", network: "9mobile", name: "9mobile 2.5GB Monthly", allowance: "2.5 GB", validity: "30 days", price: 1000 }),
  Object.freeze({ code: "9M-6P5GB-30D", network: "9mobile", name: "9mobile 6.5GB Monthly", allowance: "6.5 GB", validity: "30 days", price: 2500 }),
  Object.freeze({ code: "9M-13GB-30D", network: "9mobile", name: "9mobile 13GB Monthly", allowance: "13 GB", validity: "30 days", price: 4000 }),
]);

// Pure structural validator so tests can check fixtures without touching
// the live catalogue. Returns an array of human-readable problems.
function validateCatalogue({ networks, bundles, presets } = {}) {
  const problems = [];
  if (!Array.isArray(networks) || networks.length === 0) {
    problems.push("networks must be a non-empty array");
  }
  const networkSet = new Set(Array.isArray(networks) ? networks : []);
  if (!Array.isArray(presets) || presets.some((p) => !Number.isInteger(p) || p <= 0)) {
    problems.push("airtime presets must be positive integers");
  }
  if (!Array.isArray(bundles)) {
    problems.push("bundles must be an array");
    return problems;
  }
  const seen = new Set();
  bundles.forEach((b, i) => {
    const where = `bundles[${i}]`;
    if (!b || typeof b !== "object") {
      problems.push(`${where} must be an object`);
      return;
    }
    for (const field of ["code", "network", "name", "allowance", "validity"]) {
      if (typeof b[field] !== "string" || b[field].trim() === "") {
        problems.push(`${where} must have a non-empty ${field}`);
      }
    }
    if (typeof b.code === "string") {
      if (seen.has(b.code)) problems.push(`${where} duplicates bundle code ${b.code}`);
      seen.add(b.code);
    }
    if (typeof b.network === "string" && !networkSet.has(b.network)) {
      problems.push(`${where} has unsupported network ${b.network}`);
    }
    if (!Number.isInteger(b.price) || b.price <= 0) {
      problems.push(`${where} must have a positive integer price`);
    }
  });
  return problems;
}

// Fail fast at boot: a malformed catalogue is a programmer error and must
// never serve wrong prices.
const bootProblems = validateCatalogue({ networks: [...NETWORKS], bundles: [...BUNDLES], presets: [...AIRTIME_PRESETS] });
if (bootProblems.length > 0) {
  throw new Error(`Invalid top-up catalogue: ${bootProblems.join("; ")}`);
}

function isSupportedNetwork(network) {
  return typeof network === "string" && NETWORKS.includes(network.trim());
}

// Exact (network, code) lookup. A valid code from another network never
// matches: callers pass the requested network explicitly.
function getBundle(network, code) {
  if (typeof network !== "string" || typeof code !== "string") return null;
  const wantedNetwork = network.trim();
  const wantedCode = code.trim();
  return BUNDLES.find((b) => b.network === wantedNetwork && b.code === wantedCode) || null;
}

function getCatalogue() {
  return {
    version: CATALOGUE_VERSION,
    networks: [...NETWORKS],
    airtimePresets: [...AIRTIME_PRESETS],
    airtimeMin: AIRTIME_MIN_AMOUNT,
    airtimeMax: AIRTIME_MAX_AMOUNT,
    bundles: BUNDLES.map((b) => ({ ...b })),
  };
}

module.exports = {
  CATALOGUE_VERSION,
  NETWORKS,
  AIRTIME_PRESETS,
  AIRTIME_MIN_AMOUNT,
  AIRTIME_MAX_AMOUNT,
  BUNDLES,
  validateCatalogue,
  isSupportedNetwork,
  getBundle,
  getCatalogue,
};
