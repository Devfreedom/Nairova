import { useState } from "react";
import { api } from "../lib/api";
import { formatNaira } from "../lib/format";
import { Alert, Icons } from "../components/ui";

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
    // Strip grouping separators so comma-formatted values like 100,000 parse
    // correctly; the numeric API contract is unchanged.
    const amt = Number(String(amount).replace(/[,\s]/g, ""));
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
      <header>
        <p className="eyebrow">Send money</p>
        <h1 className="t-text mt-1 text-2xl font-bold tracking-tight">Transfer</h1>
        <p className="t-muted mt-0.5 text-sm">Send to another Nairova account. Verify the recipient before confirming.</p>
      </header>

      <form onSubmit={onSubmit} autoComplete="off" className="mt-5 space-y-4">
        <Alert>{error}</Alert>
        <Alert kind="success">{success}</Alert>

        <section aria-labelledby="step-recipient" className="card">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className={`step-num ${verified ? "done" : ""}`}>1</span>
            <h2 id="step-recipient" className="t-text text-base font-bold">Recipient</h2>
          </div>
          <label className="mt-3 block" htmlFor="transfer-recipient">
            <span className="label">Recipient account number</span>
            <span className="flex flex-col gap-2 min-[480px]:flex-row">
              <input
                id="transfer-recipient"
                name="transferRecipientAccount"
                type="text"
                autoComplete="off"
                className="field min-w-0 flex-1 font-mono tracking-wider"
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter 10-digit account number"
                value={accountNumber}
                onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setVerified(null); }}
                required
              />
              <button type="button" onClick={handleVerify} disabled={verifying} className="btn-secondary min-h-[44px] shrink-0">
                {verifying ? "…" : "Verify"}
              </button>
            </span>
          </label>
          {verified && (
            <div role="status" className="t-border mt-3 flex items-center gap-3 rounded-xl border bg-[var(--ok-bg)] px-3.5 py-3">
              <span aria-hidden="true" className="disc disc-in">
                {String(verified.name || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="t-text truncate text-sm font-bold">{verified.name}</p>
                <p className="t-muted font-mono text-xs">Acct {verified.accountNumber}</p>
              </div>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--ok)]">
                <span aria-hidden="true">✓</span> Verified
              </span>
            </div>
          )}
        </section>

        <section aria-labelledby="step-payment" className="card">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="step-num">2</span>
            <h2 id="step-payment" className="t-text text-base font-bold">Transfer details</h2>
          </div>
          <fieldset className="mt-4 space-y-4">
            <label className="block" htmlFor="transfer-amount">
              <span className="label">Amount (₦)</span>
              <input
                id="transfer-amount"
                name="transferAmount"
                type="text"
                autoComplete="off"
                className="field text-base font-semibold"
                inputMode="decimal"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block" htmlFor="transfer-pin">
              <span className="label">Transaction PIN</span>
              <input
                id="transfer-pin"
                name="transferPin"
                className="field"
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter your 4-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </label>
          </fieldset>
        </section>

        <section aria-labelledby="step-confirm" className="card card-muted">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="step-num">3</span>
            <h2 id="step-confirm" className="t-text text-base font-bold">Review &amp; send</h2>
          </div>
          <dl className="t-muted mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt>To</dt>
              <dd className="t-text text-right font-semibold">{verified ? `${verified.name} · ${verified.accountNumber}` : "Not verified yet"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Amount</dt>
              <dd className="t-text font-semibold">{amount.trim() ? `₦${amount.trim()}` : "—"}</dd>
            </div>
          </dl>
          <button className="btn-primary mt-4" disabled={busy}>
            <span aria-hidden="true" className="mr-2">{Icons.send}</span>
            {busy ? "Sending…" : "Send transfer"}
          </button>
          <p className="t-muted mt-2 text-center text-xs">Nothing moves until the server confirms the transfer.</p>
        </section>
      </form>
    </div>
  );
}
