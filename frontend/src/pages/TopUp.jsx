import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { parseAirtimeAmount } from "../lib/amount";
import { formatNaira } from "../lib/format";
import {
  SUBMIT_TIMEOUT_MS,
  mintKey,
  loadTopupPending,
  saveTopupPending,
  clearTopupPending,
  isUncertainOutcome,
  isPinlessError,
  lagosTime,
  maskMsisdn,
  buildTopupReceiptText,
} from "../lib/topup";
import { Alert, Icons } from "../components/ui";

const STEPS = ["Details", "Review", "Confirm"];
const SIMULATED_NOTE = "Simulated purchase — no real airtime or data will be delivered.";

export default function TopUp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState("airtime");
  const [catalogue, setCatalogue] = useState(null);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState("");

  const [step, setStep] = useState("details");
  const [network, setNetwork] = useState("");
  const [msisdn, setMsisdn] = useState("");
  const [preset, setPreset] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [bundleCode, setBundleCode] = useState("");
  const [pin, setPin] = useState("");
  const [parsedAmount, setParsedAmount] = useState(null);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(mintKey);
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
  const restoredOnce = useRef(false);

  const stepIndex = step === "details" ? 0 : step === "review" || step === "pin" || step === "uncertain" ? 1 : 2;
  const bundles = catalogue?.bundles || [];
  const networkBundles = network ? bundles.filter((b) => b.network === network) : [];

  // Load the server-authoritative catalogue, then restore any pending
  // intent (same key, same payload; PIN is re-entered, never restored).
  useEffect(() => {
    async function boot() {
      if (restoredOnce.current) return;
      restoredOnce.current = true;
      try {
        const res = await api.topupCatalogue();
        setCatalogue(res.data);
        const pending = loadTopupPending();
        if (!pending) return;
        if (pending.kind === "data") {
          const found = (res.data?.bundles || []).find(
            (b) => b.network === pending.network && b.code === pending.bundle?.code
          );
          if (!found) return;
          setTab("data");
          setSelectedBundle(found);
          setBundleCode(found.code);
        } else {
          setTab("airtime");
        }
        setNetwork(pending.network);
        setMsisdn(pending.msisdnDisplay);
        setParsedAmount(pending.amount);
        setNarration(pending.narration);
        setIdempotencyKey(pending.key);
        setLocked(true);
        setRestoredNotice("Restored your pending purchase. Details are locked to this attempt — enter your PIN to continue, or cancel to start over.");
        setStep("pin");
      } catch (err) {
        setCatError(err.message);
      } finally {
        setCatLoading(false);
      }
    }
    boot();
  }, []);

  function resetFlow(nextTab) {
    setStep("details");
    setNetwork("");
    setMsisdn("");
    setPreset("");
    setCustomAmount("");
    setNarration("");
    setBundleCode("");
    setPin("");
    setParsedAmount(null);
    setSelectedBundle(null);
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
    setCopied("");
    clearTopupPending();
    setIdempotencyKey(mintKey());
    if (nextTab) setTab(nextTab);
  }

  // Client-side checks are usability only; the backend re-validates everything
  // authoritatively (network allowlist, Nigerian number, bounds, catalogue).
  function validateDetails() {
    if (!network) return "Choose a network.";
    if (!/^\+?[\d\s\-().]{7,20}$/.test(msisdn.trim())) {
      return "Enter the recipient's Nigerian mobile number.";
    }
    if (tab === "airtime") {
      const raw = preset === "custom" ? customAmount : preset;
      const parsed = parseAirtimeAmount(raw);
      if (!parsed.ok) return parsed.error;
      if (narration.trim().length > 140) return "Narration must be at most 140 characters.";
      return { amount: parsed.value };
    }
    const found = networkBundles.find((b) => b.code === bundleCode);
    if (!found) return "Choose a data bundle for the selected network.";
    return { amount: found.price, bundle: found };
  }

  function handleContinue() {
    setError("");
    const checked = validateDetails();
    if (typeof checked === "string") {
      setError(checked);
      return;
    }
    setParsedAmount(checked.amount);
    setSelectedBundle(checked.bundle || null);
    setIdempotencyKey(mintKey());
    setStep("review");
  }

  function pendingPayload(key) {
    return {
      key,
      kind: tab,
      network,
      msisdn: msisdn.trim(),
      msisdnDisplay: msisdn.trim(),
      amount: parsedAmount,
      amountDisplay: tab === "data" && selectedBundle ? selectedBundle.name : String(parsedAmount),
      bundle: tab === "data" && selectedBundle
        ? {
            code: selectedBundle.code,
            name: selectedBundle.name,
            allowance: selectedBundle.allowance,
            validity: selectedBundle.validity,
          }
        : null,
      narration: narration.trim(),
    };
  }

  function handleToPin() {
    setResultError("");
    setNeedsPinSetup(false);
    setDiscardArmed(false);
    setRestoredNotice("");
    saveTopupPending(pendingPayload(idempotencyKey));
    setLocked(true);
    setStep("pin");
  }

  function handleBackToReview() {
    setIdempotencyKey(mintKey());
    clearTopupPending();
    setLocked(false);
    setRestoredNotice("");
    setResultError("");
    setStep("review");
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
      const res =
        tab === "airtime"
          ? await api.topupAirtime(
              {
                recipientMsisdn: msisdn.trim(),
                network,
                amount: parsedAmount,
                pin,
                narration: narration.trim() || undefined,
                idempotencyKey,
              },
              controller.signal
            )
          : await api.topupData(
              {
                recipientMsisdn: msisdn.trim(),
                network,
                bundleCode,
                pin,
                idempotencyKey,
              },
              controller.signal
            );
      clearTopupPending();
      setResult(res);
      setPin("");
      setIdempotencyKey(mintKey());
      setLocked(false);
      setStep("result");
      try {
        const txns = await api.transactions();
        setReceiptTxn((txns.data || []).find((t) => t.reference === res.reference) || null);
      } catch {
        setReceiptTxn(null);
      }
    } catch (err) {
      if (isPinlessError(err)) {
        saveTopupPending(pendingPayload(idempotencyKey));
        setLocked(true);
        setNeedsPinSetup(true);
        setResultError("");
      } else if (isUncertainOutcome(err)) {
        // The commit may have succeeded unseen: preserve the intent and
        // offer a same-key retry. Never show success here.
        saveTopupPending(pendingPayload(idempotencyKey));
        setLocked(true);
        setDiscardArmed(false);
        setResultError(err.message);
        setStep("uncertain");
      } else {
        clearTopupPending();
        setLocked(false);
        setResultError(err.message);
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

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
    return buildTopupReceiptText({
      reference: result.reference,
      timestamp: receiptTxn?.timestamp || result.timestamp,
      kind: tab,
      network: result.network,
      msisdn: result.recipientMsisdn,
      amount: result.amount,
      fee: result.fee,
      bundle: result.bundle,
      narration: result.narration,
      newBalance: result.newBalance,
    });
  }

  function handleDownload() {
    setShareNote("");
    const blob = new Blob([receiptText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nairova-topup-${result.reference}.txt`;
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
        await navigator.share({ title: "Nairova top-up receipt", text });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("Sharing is not available here — the receipt was copied instead.");
    } catch {
      setShareNote("Sharing is not available here — use Download instead.");
    }
  }

  const chargeAmount = tab === "airtime" ? parsedAmount : selectedBundle?.price;

  return (
    <div className="mx-auto max-w-lg">
      <header>
        <p className="eyebrow">Simulated top-up</p>
        <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Buy airtime &amp; data</h1>
        <p className="t-muted mt-0.5 text-sm">{SIMULATED_NOTE}</p>
      </header>

      <div role="tablist" aria-label="Top-up type" className="t-surface-2 mt-4 grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "airtime"}
          disabled={step !== "details"}
          onClick={() => resetFlow("airtime")}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold ${tab === "airtime" ? "t-surface t-text shadow" : "t-muted"}`}
        >
          Airtime
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "data"}
          disabled={step !== "details"}
          onClick={() => resetFlow("data")}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold ${tab === "data" ? "t-surface t-text shadow" : "t-muted"}`}
        >
          Data
        </button>
      </div>

      <ol aria-label="Top-up progress" className="mt-5 flex items-center gap-1.5">
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

      {catLoading ? (
        <div className="card mt-5" aria-label="Loading catalogue">
          <p className="t-muted py-6 text-center text-sm">Loading top-up catalogue…</p>
        </div>
      ) : !catalogue ? (
        <div className="card mt-5">
          <Alert>{catError || "Could not load the top-up catalogue."}</Alert>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {step === "details" && (
            <div className="mt-5 space-y-4">
              <Alert>{error}</Alert>
              <section aria-labelledby="step-network" className="card">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="step-num">1</span>
                  <h2 id="step-network" className="t-text text-base font-bold">Network &amp; recipient</h2>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
                  {catalogue.networks.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={network === n}
                      onClick={() => { setNetwork(n); setBundleCode(""); setError(""); }}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-bold ${network === n ? "border-[var(--brand-strong)] bg-[var(--surface-2)] t-text" : "t-border t-muted"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block" htmlFor="topup-msisdn">
                  <span className="label">Recipient mobile number</span>
                  <input
                    id="topup-msisdn"
                    name="topupMsisdn"
                    type="tel"
                    autoComplete="off"
                    className="field font-mono tracking-wider"
                    inputMode="tel"
                    placeholder="08012345678"
                    value={msisdn}
                    onChange={(e) => setMsisdn(e.target.value)}
                    required
                  />
                </label>
              </section>

              <section aria-labelledby="step-amount" className="card">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="step-num">2</span>
                  <h2 id="step-amount" className="t-text text-base font-bold">
                    {tab === "airtime" ? "Amount" : "Data bundle"}
                  </h2>
                </div>
                {tab === "airtime" ? (
                  <div className="mt-4">
                    <div className="grid grid-cols-3 gap-2">
                      {catalogue.airtimePresets.map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={preset === String(p)}
                          onClick={() => { setPreset(String(p)); setCustomAmount(""); setError(""); }}
                          className={`tnum rounded-xl border px-2 py-2.5 text-sm font-bold ${preset === String(p) ? "border-[var(--brand-strong)] bg-[var(--surface-2)] t-text" : "t-border t-muted"}`}
                        >
                          {formatNaira(p)}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-pressed={preset === "custom"}
                        onClick={() => { setPreset("custom"); setError(""); }}
                        className={`rounded-xl border px-2 py-2.5 text-sm font-bold ${preset === "custom" ? "border-[var(--brand-strong)] bg-[var(--surface-2)] t-text" : "t-border t-muted"}`}
                      >
                        Custom
                      </button>
                    </div>
                    {preset === "custom" && (
                      <label className="mt-3 block" htmlFor="topup-custom-amount">
                        <span className="label">Custom amount (₦) · ₦100 – ₦10,000</span>
                        <input
                          id="topup-custom-amount"
                          name="topupCustomAmount"
                          type="text"
                          autoComplete="off"
                          className="field tnum text-lg font-bold"
                          inputMode="decimal"
                          placeholder="Enter amount"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          required
                        />
                      </label>
                    )}
                    <label className="mt-3 block" htmlFor="topup-narration">
                      <span className="label">Narration (optional)</span>
                      <input
                        id="topup-narration"
                        name="topupNarration"
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
                ) : (
                  <div className="mt-4">
                    {!network ? (
                      <p className="t-muted text-sm">Choose a network above to see its bundles.</p>
                    ) : (
                      <fieldset>
                        <legend className="label">Bundles · {network} (simulated packages)</legend>
                        <div className="mt-1 space-y-2">
                          {networkBundles.map((b) => (
                            <label
                              key={b.code}
                              className={`t-border flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 ${bundleCode === b.code ? "bg-[var(--surface-2)]" : ""}`}
                            >
                              <input
                                type="radio"
                                name="topupBundle"
                                value={b.code}
                                checked={bundleCode === b.code}
                                onChange={() => { setBundleCode(b.code); setError(""); }}
                                className="h-4 w-4 shrink-0 accent-[var(--brand-strong)]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="t-text block truncate text-sm font-bold">{b.name}</span>
                                <span className="t-muted block text-xs">{b.allowance} · {b.validity}</span>
                              </span>
                              <span className="tnum t-text shrink-0 text-sm font-extrabold">{formatNaira(b.price)}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}
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
                  <dt>Type</dt>
                  <dd className="t-text text-right font-semibold">{tab === "airtime" ? "Airtime" : "Data"} · {network}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Recipient</dt>
                  <dd className="t-text text-right font-semibold"><span className="font-mono">{maskMsisdn(msisdn)}</span></dd>
                </div>
                {tab === "data" && selectedBundle && (
                  <div className="flex justify-between gap-3">
                    <dt>Bundle</dt>
                    <dd className="t-text text-right font-semibold">{selectedBundle.name} ({selectedBundle.allowance}, {selectedBundle.validity})</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt>Amount</dt>
                  <dd className="tnum t-text text-base font-extrabold">{formatNaira(chargeAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Fee</dt>
                  <dd className="tnum t-text font-semibold">{formatNaira(0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Total debit</dt>
                  <dd className="tnum t-text text-base font-extrabold">{formatNaira(chargeAmount)}</dd>
                </div>
                {tab === "airtime" && narration.trim() && (
                  <div className="flex justify-between gap-3">
                    <dt>Narration</dt>
                    <dd className="t-text text-right font-semibold">{narration.trim()}</dd>
                  </div>
                )}
              </dl>
              <p className="t-muted mt-3 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-xs font-medium">{SIMULATED_NOTE}</p>
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
                {tab === "airtime" ? "Airtime" : "Data"} · <strong className="t-text">{network}</strong> ·{" "}
                <strong className="tnum t-text">{formatNaira(parsedAmount)}</strong> to{" "}
                <strong className="t-text font-mono">{maskMsisdn(msisdn)}</strong>.
              </p>
              {restoredNotice && (
                <p role="status" className="t-border mt-3 rounded-xl border bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px] font-medium">
                  {restoredNotice}
                </p>
              )}
              {locked && !restoredNotice && (
                <p className="t-muted mt-2 text-xs">Details are locked to this attempt to prevent duplicate purchases.</p>
              )}
              <Alert>{resultError}</Alert>
              {needsPinSetup ? (
                <div className="t-border mt-4 rounded-xl border bg-[var(--surface-2)] px-3.5 py-3">
                  <p className="t-text text-sm font-bold">No transaction PIN yet</p>
                  <p className="t-muted mt-1 text-[13px]">
                    This account has no transaction PIN. Create one in Settings, then return here — this purchase
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
                  <label className="block" htmlFor="topup-pin">
                    <span className="label">Transaction PIN</span>
                    <input
                      id="topup-pin"
                      name="topupPin"
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
                      {busy ? "Processing…" : "Confirm purchase"}
                    </button>
                  </div>
                  <button type="button" className="link-brand mt-3 w-full text-center text-xs" disabled={busy} onClick={() => resetFlow()}>
                    Cancel this purchase
                  </button>
                </form>
              )}
            </section>
          )}

          {step === "uncertain" && (
            <section aria-labelledby="step-uncertain" className="card mt-5">
              <p className="eyebrow">Confirmation pending</p>
              <h2 id="step-uncertain" className="t-text mt-1 text-base font-bold">We couldn&apos;t confirm this purchase</h2>
              <Alert>{resultError || "The request did not complete normally."}</Alert>
              <p className="t-muted mt-3 text-sm">
                Your {tab} purchase of <strong className="tnum t-text">{formatNaira(parsedAmount)}</strong> ({network})
                may still have completed on the server. It is preserved below — retrying uses the same attempt and
                cannot debit you twice.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirm(); }} className="mt-4">
                <label className="block" htmlFor="topup-pin-retry">
                  <span className="label">Transaction PIN (to retry safely)</span>
                  <input
                    id="topup-pin-retry"
                    name="topupPinRetry"
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
                  Discarding does not reverse a purchase that already completed — check history first.
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
                    <h2 id="step-result" className="t-text text-base font-bold">Purchase successful</h2>
                  </div>
                </div>
                <dl className="t-muted mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>Type</dt>
                    <dd className="t-text text-right font-semibold">{result.kind === "data" ? "Data" : "Airtime"} · {result.network}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Recipient</dt>
                    <dd className="t-text text-right font-semibold"><span className="font-mono">{maskMsisdn(result.recipientMsisdn)}</span></dd>
                  </div>
                  {result.bundle && (
                    <div className="flex justify-between gap-3">
                      <dt>Bundle</dt>
                      <dd className="t-text text-right font-semibold">{result.bundle.name} ({result.bundle.allowance}, {result.bundle.validity})</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt>Amount</dt>
                    <dd className="tnum t-text text-base font-extrabold">{formatNaira(result.amount)}</dd>
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
                  {(receiptTxn?.timestamp || result.timestamp) && (
                    <div className="flex justify-between gap-3">
                      <dt>Date</dt>
                      <dd className="t-text text-right font-semibold">{lagosTime(receiptTxn?.timestamp || result.timestamp)} (Lagos)</dd>
                    </div>
                  )}
                </dl>
                <p className="t-muted mt-3 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-xs font-medium">{SIMULATED_NOTE}</p>
                <div className="mt-4 grid gap-2 min-[480px]:grid-cols-3">
                  <button type="button" className="btn-secondary" onClick={() => navigate("/")}>
                    Done
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => resetFlow()}>
                    Buy again
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setShowReceipt((v) => !v)} aria-expanded={showReceipt}>
                    {showReceipt ? "Hide receipt" : "View receipt"}
                  </button>
                </div>
              </section>

              {showReceipt && (
                <section aria-labelledby="step-receipt" className="card card-muted">
                  <p className="eyebrow">Receipt</p>
                  <h2 id="step-receipt" className="t-text mt-1 text-base font-bold">Top-up receipt</h2>
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
                    {(receiptTxn?.timestamp || result.timestamp) && (
                      <div className="flex justify-between gap-3">
                        <dt>Date</dt>
                        <dd className="t-text text-right font-semibold">{lagosTime(receiptTxn?.timestamp || result.timestamp)} (Lagos)</dd>
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
                      <dt>Recipient</dt>
                      <dd className="t-text text-right font-semibold"><span className="font-mono">{maskMsisdn(result.recipientMsisdn)}</span></dd>
                    </div>
                    {result.bundle && (
                      <div className="flex justify-between gap-3">
                        <dt>Bundle</dt>
                        <dd className="t-text text-right font-semibold">{result.bundle.name} ({result.bundle.allowance}, {result.bundle.validity})</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt>Amount</dt>
                      <dd className="tnum t-text font-extrabold">{formatNaira(result.amount)}</dd>
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
                  <p className="t-muted mt-3 text-xs">Simulated {result.kind} purchase. No real delivery occurred. Details above match the recorded transaction.</p>
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
        </>
      )}
    </div>
  );
}

