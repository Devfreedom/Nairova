import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { parseAmount } from "../lib/amount";
import { formatDate, formatNaira } from "../lib/format";
import { Alert, Empty, Icons, PasswordField, Skeleton, StatusPill } from "../components/ui";

function identifierOf(u) {
  return u?.email || u?.phone || "—";
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [txns, setTxns] = useState([]);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [u, t] = await Promise.all([api.adminUsers(), api.adminTransactions()]);
      setUsers(u.data || u.users || []);
      setTxns(t.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onCredit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setReceipt(null);
    const acct = accountNumber.trim();
    if (!/^\d{10}$/.test(acct)) {
      setError("Select an account (10 digits) to credit.");
      return;
    }
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const recipient = users.find((u) => u.accountNumber === acct);
    setBusy(true);
    try {
      // Normalized numeric amount goes to the API; the receipt below is built
      // only from the confirmed server response.
      const res = await api.adminCredit(acct, parsed.value);
      const txn = res.data?.transaction;
      setReceipt({
        name: recipient?.name || txn?.receiverName || "Customer",
        identifier: recipient ? identifierOf(recipient) : "",
        accountNumber: txn?.receiverAccountNumber || acct,
        amount: txn?.amount ?? parsed.value,
        newBalance: res.data?.newBalance,
      });
      setAmount("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selected = /^\d{10}$/.test(accountNumber.trim())
    ? users.find((u) => u.accountNumber === accountNumber.trim())
    : null;
  const preview = parseAmount(amount);

  function openReset(customer) {
    setResetTarget(customer);
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess("");
  }

  function closeReset() {
    if (resetBusy) return;
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess("");
  }

  async function onResetPassword(e) {
    e.preventDefault();
    if (resetBusy || !resetTarget) return;
    setResetError("");
    setResetSuccess("");
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match. Enter the new password twice.");
      return;
    }
    setResetBusy(true);
    try {
      // Success is claimed only after the backend confirms the reset.
      const res = await api.adminResetPassword(resetTarget.id, newPassword, confirmPassword);
      setResetSuccess(
        `Password reset for ${res.data?.name || resetTarget.name} (${res.data?.email || res.data?.phone || identifierOf(resetTarget)}). They can now log in with the new password.`
      );
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Privileged access</p>
          <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Admin dashboard</h1>
          <p className="t-muted mt-0.5 text-sm">Credit <strong>simulated test funds</strong> and manage customer access. Every action is recorded.</p>
          {!loading && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              <span className="t-muted rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-bold">
                {users.length} customer{users.length === 1 ? "" : "s"}
              </span>
              <span className="t-muted rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-bold">
                {txns.length} ledger record{txns.length === 1 ? "" : "s"}
              </span>
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-xs font-bold text-white dark:bg-voltaic dark:text-midnight">
          <span aria-hidden="true">{Icons.shield}</span> Administrator
        </span>
      </header>

      <div><Alert>{error}</Alert></div>

      <section aria-labelledby="admin-credit" className="card">
        <p className="eyebrow">Test funds</p>
        <h2 id="admin-credit" className="t-text mt-1 text-base font-bold">Credit an account</h2>
        {receipt && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--ok-bg)] px-3.5 py-3 text-sm text-[var(--ok)]" role="status">
            <p className="font-bold">Credit confirmed (simulated)</p>
            <p className="mt-0.5">
              <strong>{formatNaira(receipt.amount)}</strong> to <strong>{receipt.name}</strong>
              {receipt.identifier ? ` (${receipt.identifier})` : ""} · acct{" "}
              <span className="font-mono">{receipt.accountNumber}</span> · new balance{" "}
              <strong>{receipt.newBalance !== undefined ? formatNaira(receipt.newBalance) : "—"}</strong>
            </p>
          </div>
        )}
        <form onSubmit={onCredit} className="mt-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="block">
              <span className="label">Account number</span>
              <input
                className="field font-mono tracking-wider"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit account"
                value={accountNumber}
                onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setReceipt(null); }}
                disabled={busy}
                required
              />
            </label>
            <label className="block">
              <span className="label">Amount (₦, simulated)</span>
              <input
                className="field"
                inputMode="decimal"
                placeholder="e.g. 100,000.50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                required
              />
            </label>
            <button className="btn-primary md:w-auto md:px-6" disabled={busy}>{busy ? "Crediting…" : "Credit account"}</button>
          </div>
          {amount.trim() !== "" && preview.ok && (
            <p className="t-muted mt-2 text-xs">= {formatNaira(preview.value)} will be credited as simulated test funds</p>
          )}
        </form>
        {/^\d{10}$/.test(accountNumber.trim()) && (
          <div className="t-surface-2 mt-3 flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm" aria-live="polite">
            {selected ? (
              <>
                <span aria-hidden="true" className="disc disc-info">{initials(selected.name)}</span>
                <p className="t-text min-w-0">
                  <strong>{selected.name}</strong> <span className="t-muted">({identifierOf(selected)})</span>
                  <br />
                  <span className="font-mono text-xs">{selected.accountNumber}</span> · current balance{" "}
                  <strong>{formatNaira(selected.balance)}</strong>
                </p>
              </>
            ) : (
              !loading && <p className="text-[var(--danger)]">No customer found with account number {accountNumber.trim()}.</p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="admin-customers" className="card">
        <p className="eyebrow">Directory</p>
        <h2 id="admin-customers" className="t-text mt-1 text-base font-bold">
          Customers {loading ? "" : `(${users.length})`}
        </h2>
        {loading ? (
          <div className="mt-3 space-y-2" aria-label="Loading customers">
            <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
          </div>
        ) : users.length === 0 ? (
          <div className="mt-3"><Empty title="No customers yet" /></div>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="t-surface sticky top-0">
                  <tr className="t-border border-b">
                    <th scope="col" className="t-muted py-2.5 pr-3 text-xs font-bold uppercase tracking-wide">Customer</th>
                    <th scope="col" className="t-muted py-2.5 pr-3 text-xs font-bold uppercase tracking-wide">Email / phone</th>
                    <th scope="col" className="t-muted py-2.5 pr-3 text-xs font-bold uppercase tracking-wide">Account</th>
                    <th scope="col" className="t-muted py-2.5 pr-3 text-right text-xs font-bold uppercase tracking-wide">Balance</th>
                    <th scope="col" className="t-muted py-2.5 text-right text-xs font-bold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="t-border divide-y">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2.5">
                          <span aria-hidden="true" className="disc disc-info !h-8 !w-8 text-xs">{initials(u.name)}</span>
                          <span>
                            <span className="t-text block font-semibold">{u.name}</span>
                            <span className="t-muted text-xs">{u.role}</span>
                          </span>
                        </span>
                      </td>
                      <td className="t-muted py-3 pr-3">{identifierOf(u)}</td>
                      <td className="tnum t-text py-3 pr-3 font-mono text-[13px]">{u.accountNumber}</td>
                      <td className="tnum t-text py-3 pr-3 text-right font-bold">{formatNaira(u.balance)}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <button className="btn-secondary px-3 py-1.5 text-xs" disabled={busy}
                            onClick={() => { setAccountNumber(u.accountNumber); setReceipt(null); }}>
                            Select
                          </button>
                          {u.role !== "admin" && (
                            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={resetBusy} onClick={() => openReset(u)}>
                              Reset password
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 space-y-2.5 md:hidden">
              {users.map((u) => (
                <li key={u.id} className="t-border rounded-xl border bg-[var(--surface-2)] p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="disc disc-info !h-9 !w-9">{initials(u.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="t-text truncate text-sm font-bold">{u.name} <span className="t-muted font-medium">· {u.role}</span></p>
                      <p className="t-muted truncate text-xs">{identifierOf(u)}</p>
                    </div>
                    <p className="t-text shrink-0 text-sm font-bold">{formatNaira(u.balance)}</p>
                  </div>
                  <p className="t-muted mt-2 font-mono text-xs">Acct {u.accountNumber}</p>
                  <div className="mt-2.5 flex gap-2">
                    <button className="btn-secondary min-h-[44px] flex-1 text-xs" disabled={busy}
                      onClick={() => { setAccountNumber(u.accountNumber); setReceipt(null); }}>
                      Select for credit
                    </button>
                    {u.role !== "admin" && (
                      <button className="btn-secondary min-h-[44px] flex-1 text-xs" disabled={resetBusy} onClick={() => openReset(u)}>
                        Reset password
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {resetTarget && (
        <section aria-labelledby="reset-password-heading" className="card" role="dialog" aria-modal="false">
          <p className="eyebrow">Customer access</p>
          <h2 id="reset-password-heading" className="t-text mt-1 text-base font-bold">Reset customer password</h2>
          <p className="t-muted mt-1 text-sm" aria-live="polite">
            <strong className="t-text">{resetTarget.name}</strong> ({identifierOf(resetTarget)}) · acct{" "}
            <span className="font-mono">{resetTarget.accountNumber}</span>
          </p>
          <p className="t-muted mt-1 text-xs">Only the password changes. Balance, PIN, account number, and history are untouched.</p>
          <form onSubmit={onResetPassword} className="mt-3 space-y-3">
            <Alert>{resetError}</Alert>
            <Alert kind="success">{resetSuccess}</Alert>
            <PasswordField label="New password" id="reset-new-password" autoComplete="new-password"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={resetBusy} required />
            <PasswordField label="Confirm new password" id="reset-confirm-password" autoComplete="new-password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={resetBusy} required />
            <p className="t-muted text-xs">Use 6+ characters with upper, lower, number and a symbol.</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary w-auto px-5" disabled={resetBusy}>
                {resetBusy ? "Resetting…" : "Reset password"}
              </button>
              <button type="button" className="btn-secondary" disabled={resetBusy} onClick={closeReset}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section aria-labelledby="admin-activity" className="card">
        <p className="eyebrow">Ledger</p>
        <h2 id="admin-activity" className="t-text mt-1 text-base font-bold">Recorded activity</h2>
        {txns.length === 0 ? (
          <div className="mt-3"><Empty title="No activity recorded" /></div>
        ) : (
          <ul className="t-border mt-1 divide-y">
            {txns.slice(0, 20).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span aria-hidden="true" className={`disc !h-8 !w-8 text-xs ${t.type === "transfer" ? "disc-info" : "disc-in"}`}>
                  {t.type === "transfer" ? "⇄" : "+"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-text truncate font-semibold">{t.type} · {formatNaira(t.amount)}</p>
                  <p className="t-muted truncate text-xs">
                    {t.senderAccountNumber || "—"} → {t.receiverAccountNumber || "—"} · {formatDate(t.timestamp)} · {t.status}
                    {t.adminEmail ? ` · by ${t.adminEmail}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill status={t.status} />
                  <p className="t-muted mt-0.5 text-[11px]">#{t.id}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
