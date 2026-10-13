import { useState } from "react";
import { api } from "../lib/api";
import { parseTransferAmount } from "../lib/amount";
import { formatNaira } from "../lib/format";
import { Alert, Icons } from "../components/ui";

export default function Transfer() {
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // One idempotency key per intended transfer: retries reuse it so a
  // double-click cannot debit twice; a new transfer mints a fresh key.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

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
    // Client-side transfer bounds (₦100–₦1,000,000); the backend enforces
    // them authoritatively. The numeric API contract is unchanged.
    const parsed = parseTransferAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter your 4-digit transaction PIN.");
      return;
    }
    if (narration.trim().length > 140) {
      setError("Narration must be at most 140 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.transfer({
        receiverAccountNumber: accountNumber.trim(),
        amount: parsed.value,
        pin,
        narration: narration.trim() || undefined,
        idempotencyKey,
      });
      setSuccess(`${res.message}. New balance: ${formatNaira(res.newBalance)}.`);
      setAmount("");
      setNarration("");
      setPin("");
      // A deliberately new transfer must never reuse the previous key.
      setIdempotencyKey(crypto.randomUUID());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const stepLabels = ["Recipient", "Details", "Confirm"];
  const currentStep = success ? 2 : verified ? 1 : 0;

  return (
    <div className="mx-auto max-w-lg">
      <header>
        <p className="eyebrow">Send money</p>
        <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Transfer</h1>
        <p className="t-muted mt-0.5 text-sm">Send to another Nairova account. Verify the recipient before confirming.</p>
      </header>

      <ol aria-label="Transfer progress" className="mt-5 flex items-center gap-1.5">
        {stepLabels.map((label, i) => {
          const done = i < currentStep || (i === 2 && !!success);
          const active = i === currentStep;
          return (
            <li key={label} className="flex-1" aria-current={active ? "step" : undefined}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`step-num ${done ? "done" : ""} ${active && !done ? "!bg-[var(--brand)] !text-white dark:!text-[#101C35]" : ""}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={`truncate text-xs font-bold ${active || done ? "t-text" : "t-muted"}`}>{label}</span>
              </span>
              <span aria-hidden="true" className={`mt-1.5 block h-1 rounded-full ${i <= currentStep ? "bg-[var(--brand-strong)]" : "bg-[var(--border)]"}`} />
            </li>
          );
        })}
      </ol>

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
              <span className="label">Amount (₦) · ₦100 – ₦1,000,000</span>
              <input
                id="transfer-amount"
                name="transferAmount"
                type="text"
                autoComplete="off"
                className="field tnum text-lg font-bold"
                inputMode="decimal"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block" htmlFor="transfer-narration">
              <span className="label">Narration (optional)</span>
              <input
                id="transfer-narration"
                name="transferNarration"
                type="text"
                autoComplete="off"
                className="field"
                maxLength={140}
                placeholder="What is this for?"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
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
              <dd className="tnum t-text text-base font-extrabold">{amount.trim() ? `₦${amount.trim()}` : "—"}</dd>
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
