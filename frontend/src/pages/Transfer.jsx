import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { parseTransferAmount } from "../lib/amount";
import { formatNaira } from "../lib/format";
import {
  SUBMIT_TIMEOUT_MS,
  mintKey,
  loadPending,
  savePending,
  clearPending,
  isUncertainOutcome,
  isPinlessError,
  lagosTime,
  buildReceiptText,
} from "../lib/transfer";
import { Alert, Icons } from "../components/ui";

const STEPS = ["Details", "Review", "Confirm"];

export default function Transfer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState("details");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState(null);
  const [parsedAmount, setParsedAmount] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(mintKey);
  // Locked payload: while a pending intent exists, details cannot be edited
  // under the same key (the server would 409 a changed fingerprint anyway).
  const [locked, setLocked] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState("");
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState("");
  const [receiptTxn, setReceiptTxn] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [copied, setCopied] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const restoredOnce = useRef(false);

  const stepIndex = step === "details" ? 0 : step === "review" || step === "pin" || step === "uncertain" ? 1 : 2;

  // Restore a pending intent after a refresh: same key, same payload, PIN to
  // be re-entered. Nothing is resubmitted automatically.
  useEffect(() => {
    async function boot() {
      if (restoredOnce.current) return;
      restoredOnce.current = true;
      const pending = loadPending();
      if (!pending) return;
      setAccountNumber(pending.receiverAccountNumber);
      setAmount(pending.amountDisplay);
      setNarration(pending.narration);
      setVerified({ name: pending.receiverName, accountNumber: pending.receiverAccountNumber });
      setParsedAmount(pending.amount);
      setIdempotencyKey(pending.key);
      setLocked(true);
      setRestoredNotice("Restored your pending transfer. Details are locked to this attempt — enter your PIN to continue, or cancel to start over.");
      setStep("pin");
    }
    boot();
  }, []);

  async function handleVerify() {
    setError("");
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

  function handleContinue() {
    setError("");
    if (!verified || verified.accountNumber !== accountNumber.trim()) {
      setError("Verify the recipient account before continuing.");
      return;
    }
    const parsed = parseTransferAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (narration.trim().length > 140) {
      setError("Narration must be at most 140 characters.");
      return;
    }
    setParsedAmount(parsed.value);
    // One idempotency key per intended transfer, minted as the user commits
    // to these details. Retries reuse it; a new transfer mints a fresh one.
    setIdempotencyKey(mintKey());
    setStep("review");
  }

  function pendingPayload(key) {
    return {
      key,
      receiverAccountNumber: verified.accountNumber,
      receiverName: verified.name,
      amount: parsedAmount,
      amountDisplay: amount,
      narration: narration.trim(),
    };
  }

  function handleToPin() {
    setResultError("");
    setNeedsPinSetup(false);
    setDiscardArmed(false);
    setRestoredNotice("");
    // Persist before submission so a refresh or timeout keeps this exact
    // intent (key + payload, never the PIN) available for a safe retry.
    savePending(pendingPayload(idempotencyKey));
    setLocked(true);
    setStep("pin");
  }

  // Editing details abandons the current key: a changed payload under an old
  // key would be rejected, so a fresh key starts the new intent.
  function handleBackToReview() {
    setIdempotencyKey(mintKey());
    clearPending();
    setLocked(false);
    setRestoredNotice("");
    setResultError("");
    setStep("review");
  }

  function resetFlow() {
    setStep("details");
    setAccountNumber("");
    setAmount("");
    setNarration("");
    setPin("");
    setVerified(null);
    setParsedAmount(null);
    setResult(null);
    setResultError("");
    setReceiptTxn(null);
    setShowReceipt(false);
    setError("");
    setLocked(false);
    setRestoredNotice("");
    setNeedsPinSetup(false);
    setDiscardArmed(false);
    setShareNote("");
    clearPending();
    setIdempotencyKey(mintKey());
  }

  async function handleConfirm() {
    if (busy) return;
    setResultError("");
    setNeedsPinSetup(false);
    if (!/^\d{4}$/.test(pin)) {
      setResultError("Enter your 4-digit transaction PIN.");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      // The only balance-changing call in this flow. Nothing moves until
      // the server confirms; the outcome below renders the real response.
      const res = await api.transfer(
        {
          receiverAccountNumber: verified.accountNumber,
          amount: parsedAmount,
          pin,
          narration: narration.trim() || undefined,
          idempotencyKey,
        },
        controller.signal
      );
      clearPending();
      setResult(res);
      setPin("");
      setIdempotencyKey(mintKey());
      setLocked(false);
      setStep("result");
      // Best-effort receipt enrichment: match the ledger row for its
      // server-recorded timestamp. Absence never blocks the result.
      try {
        const txns = await api.transactions();
        setReceiptTxn((txns.data || []).find((t) => t.reference === res.reference) || null);
      } catch {
        setReceiptTxn(null);
      }
    } catch (err) {
      if (isPinlessError(err)) {
        // Definitive, but the key was never consumed: keep the pending
        // intent so the user can create a PIN and return to this attempt.
        savePending(pendingPayload(idempotencyKey));
        setLocked(true);
        setNeedsPinSetup(true);
        setResultError("");
      } else if (isUncertainOutcome(err)) {
        // The commit may have succeeded unseen: preserve the intent and
        // offer a same-key retry. Never show success here.
        savePending(pendingPayload(idempotencyKey));
        setLocked(true);
        setDiscardArmed(false);
        setResultError(err.message);
        setStep("uncertain");
      } else {
        // Definitive rejection: nothing executed. The in-memory key is
        // retained for an unchanged retry; editing mints a fresh one.
        clearPending();
        setLocked(false);
        setResultError(err.message);
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  // Explicit, warned discard of an unresolved intent — never silent. The
  // server may still have committed, so the user is told to check history.
  function handleDiscard() {
    if (!discardArmed) {
      setDiscardArmed(true);
      return;
    }
    resetFlow();
  }

  async function handleCopy(text, what) {
    setCopied("");
    setShareNote("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("");
    }
  }

  function receiptText() {
    const fromAcct = receiptTxn?.senderAccountNumber || user?.accountNumber;
    const lines = [
      "Nairova transfer receipt",
      "Simulated transfer between Nairova accounts. Not a real bank.",
      "",
      "Status: Success",
      `Reference: ${result.reference}`,
      receiptTxn?.timestamp ? `Date: ${lagosTime(receiptTxn.timestamp)} (Africa/Lagos)` : null,
      `From: ${user?.name || "Your Nairova account"}${fromAcct ? ` (${fromAcct})` : ""}`,
      `To: ${verified.name} (${verified.accountNumber})`,
      `Amount: ${formatNaira(parsedAmount)}`,
      `Fee: ${formatNaira(result.fee ?? 0)}`,
      result.narration ? `Narration: ${result.narration}` : null,
    ];
    return lines.filter(Boolean).join("\n");
  }

  function handleDownload() {
    setShareNote("");
    const blob = new Blob([receiptText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nairova-receipt-${result.reference}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleShare() {
    setCopied("");
    setShareNote("");
    const text = receiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Nairova transfer receipt", text });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    // No native share (e.g. desktop): fall back to copying the receipt.
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("Sharing is not available here — the receipt was copied instead.");
    } catch {
      setShareNote("Sharing is not available here — use Download instead.");
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <header>
        <p className="eyebrow">Send money</p>
        <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Transfer</h1>
        <p className="t-muted mt-0.5 text-sm">Send to another Nairova account. Verify the recipient before confirming.</p>
      </header>

      <ol aria-label="Transfer progress" className="mt-5 flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={label} className="flex-1" aria-current={active ? "step" : undefined}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`step-num ${done ? "done" : ""} ${active && !done ? "!bg-[var(--brand)] !text-white dark:!text-[#101C35]" : ""}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={`truncate text-xs font-bold ${active || done ? "t-text" : "t-muted"}`}>{label}</span>
              </span>
              <span aria-hidden="true" className={`mt-1.5 block h-1 rounded-full ${i <= stepIndex ? "bg-[var(--brand-strong)]" : "bg-[var(--border)]"}`} />
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <div className="mt-5 space-y-4">
          <Alert>{error}</Alert>
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
            <div className="mt-4 space-y-4">
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
            </div>
            <button type="button" className="btn-primary mt-4" onClick={handleContinue}>
              Continue to review
            </button>
          </section>
        </div>
      )}

      {step === "review" && (
        <section aria-labelledby="step-review" className="card mt-5">
          <p className="eyebrow">Review</p>
          <h2 id="step-review" className="t-text mt-1 text-base font-bold">Check before you confirm</h2>
          <dl className="t-muted mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt>To</dt>
              <dd className="t-text text-right font-semibold">{verified.name} · <span className="font-mono">{verified.accountNumber}</span></dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Amount</dt>
              <dd className="tnum t-text text-base font-extrabold">{formatNaira(parsedAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Fee</dt>
              <dd className="tnum t-text font-semibold">{formatNaira(0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Total debit</dt>
              <dd className="tnum t-text text-base font-extrabold">{formatNaira(parsedAmount)}</dd>
            </div>
            {narration.trim() && (
              <div className="flex justify-between gap-3">
                <dt>Narration</dt>
                <dd className="t-text text-right font-semibold">{narration.trim()}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 grid gap-2 min-[480px]:grid-cols-2">
            <button type="button" className="btn-secondary" onClick={() => { setError(""); setStep("details"); }}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleToPin}>
              Continue to PIN
            </button>
          </div>
          <p className="t-muted mt-2 text-center text-xs">Nothing moves until you confirm with your PIN and the server approves.</p>
        </section>
      )}

      {step === "pin" && (
        <section aria-labelledby="step-pin" className="card mt-5">
          <p className="eyebrow">Confirm</p>
          <h2 id="step-pin" className="t-text mt-1 text-base font-bold">Enter your transaction PIN</h2>
          <p className="t-muted mt-1 text-sm">
            Sending <strong className="tnum t-text">{formatNaira(parsedAmount)}</strong> to{" "}
            <strong className="t-text">{verified.name}</strong>.
          </p>
          {restoredNotice && (
            <p role="status" className="t-border mt-3 rounded-xl border bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px] font-medium">
              {restoredNotice}
            </p>
          )}
          {locked && !restoredNotice && (
            <p className="t-muted mt-2 text-xs">Details are locked to this attempt to prevent duplicate transfers.</p>
          )}
          <Alert>{resultError}</Alert>
          {needsPinSetup ? (
            <div className="t-border mt-4 rounded-xl border bg-[var(--surface-2)] px-3.5 py-3">
              <p className="t-text text-sm font-bold">No transaction PIN yet</p>
              <p className="t-muted mt-1 text-[13px]">
                This account has no transaction PIN. Create one in Settings, then return here — this transfer
                attempt is preserved and you can submit it with the same details.
              </p>
              <div className="mt-3 grid gap-2 min-[480px]:grid-cols-2">
                <Link to="/settings" className="btn-secondary">Go to Settings</Link>
                <button type="button" className="btn-primary" onClick={() => { setNeedsPinSetup(false); setResultError(""); }}>
                  I&apos;ve set my PIN
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleConfirm(); }} className="mt-4">
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
              <div className="mt-4 grid gap-2 min-[480px]:grid-cols-2">
                <button type="button" className="btn-secondary" disabled={busy} onClick={handleBackToReview}>
                  Back
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  <span aria-hidden="true" className="mr-2">{Icons.send}</span>
                  {busy ? "Sending…" : "Confirm transfer"}
                </button>
              </div>
              <button type="button" className="link-brand mt-3 w-full text-center text-xs" disabled={busy} onClick={resetFlow}>
                Cancel this transfer
              </button>
            </form>
          )}
        </section>
      )}

      {step === "uncertain" && (
        <section aria-labelledby="step-uncertain" className="card mt-5">
          <p className="eyebrow">Confirmation pending</p>
          <h2 id="step-uncertain" className="t-text mt-1 text-base font-bold">We couldn&apos;t confirm this transfer</h2>
          <Alert>{resultError || "The request did not complete normally."}</Alert>
          <p className="t-muted mt-3 text-sm">
            Your transfer of <strong className="tnum t-text">{formatNaira(parsedAmount)}</strong> to{" "}
            <strong className="t-text">{verified.name}</strong> may still have completed on the server.
            It is preserved below — retrying uses the same attempt and cannot debit you twice.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleConfirm(); }} className="mt-4">
            <label className="block" htmlFor="transfer-pin-retry">
              <span className="label">Transaction PIN (to retry safely)</span>
              <input
                id="transfer-pin-retry"
                name="transferPinRetry"
                className="field"
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={4}
                placeholder="Re-enter your 4-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </label>
            <button type="submit" className="btn-primary mt-3" disabled={busy}>
              <span aria-hidden="true" className="mr-2">{Icons.send}</span>
              {busy ? "Retrying…" : "Retry with the same attempt"}
            </button>
          </form>
          <div className="mt-2 grid gap-2 min-[480px]:grid-cols-2">
            <Link to="/history" className="btn-secondary">Check history</Link>
            <button type="button" className="btn-secondary" disabled={busy} onClick={handleDiscard}>
              {discardArmed ? "Tap again to discard" : "Discard attempt"}
            </button>
          </div>
          {discardArmed && (
            <p role="alert" className="mt-2 text-center text-xs font-semibold text-[var(--danger)]">
              Discarding does not reverse a transfer that already completed — check history first.
            </p>
          )}
        </section>
      )}

      {step === "result" && result && (
        <div className="mt-5 space-y-4">
          <section aria-labelledby="step-result" className="card">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="disc disc-in">✓</span>
              <div>
                <p className="eyebrow">Result</p>
                <h2 id="step-result" className="t-text text-base font-bold">Transfer successful</h2>
              </div>
            </div>
            <dl className="t-muted mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Amount</dt>
                <dd className="tnum t-text text-base font-extrabold">{formatNaira(parsedAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>To</dt>
                <dd className="t-text text-right font-semibold">{verified.name} · <span className="font-mono">{verified.accountNumber}</span></dd>
              </div>
              {result.narration && (
                <div className="flex justify-between gap-3">
                  <dt>Narration</dt>
                  <dd className="t-text text-right font-semibold">{result.narration}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt>Fee</dt>
                <dd className="tnum t-text font-semibold">{formatNaira(result.fee ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Reference</dt>
                <dd className="flex items-center gap-2">
                  <span className="t-text font-mono font-semibold">{result.reference}</span>
                  <button type="button" className="link-brand text-xs" onClick={() => handleCopy(result.reference, "reference")}>
                    {copied === "reference" ? "Copied" : "Copy"}
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>New balance</dt>
                <dd className="tnum t-text font-extrabold">{formatNaira(result.newBalance)}</dd>
              </div>
              {receiptTxn?.timestamp && (
                <div className="flex justify-between gap-3">
                  <dt>Date</dt>
                  <dd className="t-text text-right font-semibold">{lagosTime(receiptTxn.timestamp)} (Lagos)</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 grid gap-2 min-[480px]:grid-cols-3">
              <button type="button" className="btn-secondary" onClick={() => navigate("/")}>
                Done
              </button>
              <button type="button" className="btn-secondary" onClick={resetFlow}>
                Send another
              </button>
              <button type="button" className="btn-primary" onClick={() => setShowReceipt((v) => !v)} aria-expanded={showReceipt}>
                {showReceipt ? "Hide receipt" : "View receipt"}
              </button>
            </div>
          </section>

          {showReceipt && (
            <section aria-labelledby="step-receipt" className="card card-muted">
              <p className="eyebrow">Receipt</p>
              <h2 id="step-receipt" className="t-text mt-1 text-base font-bold">Transfer receipt</h2>
              <dl className="t-muted mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>Status</dt>
                  <dd className="font-bold text-[var(--ok)]">Success</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Reference</dt>
                  <dd className="flex items-center gap-2">
                    <span className="t-text font-mono font-semibold">{result.reference}</span>
                    <button type="button" className="link-brand text-xs" onClick={() => handleCopy(result.reference, "receipt-reference")}>
                      {copied === "receipt-reference" ? "Copied" : "Copy"}
                    </button>
                  </dd>
                </div>
                {receiptTxn?.timestamp && (
                  <div className="flex justify-between gap-3">
                    <dt>Date</dt>
                    <dd className="t-text text-right font-semibold">{lagosTime(receiptTxn.timestamp)} (Lagos)</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt>From</dt>
                  <dd className="t-text text-right font-semibold">
                    {user?.name || "Your Nairova account"}
                    {(receiptTxn?.senderAccountNumber || user?.accountNumber) && (
                      <> · <span className="font-mono">{receiptTxn?.senderAccountNumber || user.accountNumber}</span></>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>To</dt>
                  <dd className="t-text text-right font-semibold">{verified.name} · <span className="font-mono">{verified.accountNumber}</span></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Amount</dt>
                  <dd className="tnum t-text font-extrabold">{formatNaira(parsedAmount)}</dd>
                </div>
                {result.narration && (
                  <div className="flex justify-between gap-3">
                    <dt>Narration</dt>
                    <dd className="t-text text-right font-semibold">{result.narration}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt>Fee</dt>
                  <dd className="tnum t-text font-semibold">{formatNaira(result.fee ?? 0)}</dd>
                </div>
              </dl>
              <p className="t-muted mt-3 text-xs">Simulated transfer between Nairova accounts. Details above match the recorded transaction.</p>
              <div className="mt-3 grid gap-2 min-[480px]:grid-cols-2">
                <button type="button" className="btn-secondary" onClick={handleDownload}>
                  Download receipt
                </button>
                <button type="button" className="btn-secondary" onClick={handleShare}>
                  Share receipt
                </button>
              </div>
              {shareNote && <p role="status" className="t-muted mt-2 text-center text-xs">{shareNote}</p>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
