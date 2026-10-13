import { useState } from "react";
import { api } from "../lib/api";
import { formatNaira } from "../lib/format";
import { Alert, SectionHeading } from "../components/ui";

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
    if (busy) return;
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
        <SectionHeading title="Transfer simulated funds" hint="Verify the recipient before sending." />
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
            <p role="status" className="rounded-lg border border-[var(--border)] bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]">
              Recipient: <strong>{verified.name}</strong> ({verified.accountNumber})
            </p>
          )}
          <label className="block">
            <span className="label">Amount (₦, simulated)</span>
            <input
              className="field"
              inputMode="decimal"
              placeholder="e.g. 100,000"
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
