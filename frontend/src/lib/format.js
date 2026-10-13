export function formatNaira(amount) {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso || "");
  }
}

export function describeTransaction(txn, selfId) {
  const type = txn.type || "transfer";
  if (type === "admin_credit") return txn.receiverId === selfId ? "Admin credit received" : "Admin credit sent";
  if (type === "deposit") return "Self deposit (simulated)";
  if (type === "airtime") return "Airtime purchase (simulated)";
  if (type === "data") return "Data purchase (simulated)";
  if (txn.senderId === selfId) return "Transfer sent";
  return "Transfer received";
}

export function signedAmount(txn, selfId) {
  if ((txn.type === "deposit" || txn.type === "admin_credit") && txn.receiverId === selfId) return 1;
  if (txn.type === "transfer") return txn.senderId === selfId ? -1 : 1;
  // Purchases always debit the buyer; a NULL receiver means no counterparty.
  if (txn.type === "airtime" || txn.type === "data") return txn.senderId === selfId ? -1 : 1;
  return 1;
}
