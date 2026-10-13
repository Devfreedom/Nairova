import { useState } from "react";
import { api } from "../lib/api";
import { formatNaira } from "../lib/format";
import { Alert } from "../components/ui";

export default function Transfer() {
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setError("");
    setSuccess("");
    setVerified(null);
    const acct = accountNumber.trim();
    if (!/^\d{10}$/.test(acct)) {
      setError("Enter a 10-digit recipient account number first.");
      return;
    }
    setVerifying(true);
    try {
      const res = await api.verifyAccount(acct);
      setVerified(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter your 4-digit transaction PIN.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.transfer({ receiverAccountNumber: accountNumber.trim(), amount: amt, pin });
      setSuccess(`${res.message}. New balance: ${formatNaira(res.newBalance)}.`);
      setAmount("");
      setPin("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="card">
        <h1 className="text-xl font-bold">Transfer simulated funds</h1>
        <p className="mt-1 text-sm text-slate-500">Verify the recipient before sending.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Alert kind="success">{success}</Alert>
          <label className="block">
            <span className="label">Recipient account number</span>
            <span className="flex gap-2">
              <input
                className="field"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit account number"
                value={accountNumber}
                onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setVerified(null); }}
                required
              />
              <button type="button" onClick={handleVerify} disabled={verifying} className="btn-secondary shrink-0">
                {verifying ? "…" : "Verify"}
              </button>
            </span>
          </label>
          {verified && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Recipient: <strong>{verified.name}</strong> ({verified.accountNumber})
            </p>
          )}
          <label className="block">
            <span className="label">Amount (₦)</span>
            <input
              className="field"
              inputMode="decimal"
              placeholder="e.g. 1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="label">Transaction PIN</span>
            <input
              className="field"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send transfer"}</button>
        </form>
      </div>
    </div>
  );
}
