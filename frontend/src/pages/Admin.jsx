import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { parseAmount } from "../lib/amount";
import { formatDate, formatNaira } from "../lib/format";
import { Alert, Empty } from "../components/ui";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [txns, setTxns] = useState([]);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
        email: recipient?.email || "",
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

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-bold">Admin dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Credit customer accounts with <strong>simulated test funds</strong>. Every credit is recorded.</p>
        <Alert>{error}</Alert>
        <Alert kind="success">{success}</Alert>

        <form onSubmit={onCredit} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="label">Account number</span>
            <input
              className="field"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit account"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <label className="block">
            <span className="label">Amount (₦, simulated)</span>
            <input className="field" inputMode="decimal" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <button className="btn-primary md:self-end" disabled={busy}>{busy ? "Crediting…" : "Credit account"}</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold">Customers {loading ? "" : `(${users.length})`}</h2>
        {loading ? (
          <p className="py-4 text-sm text-slate-500">Loading…</p>
        ) : users.length === 0 ? (
          <div className="mt-2"><Empty title="No customers yet" /></div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">Account</th>
                  <th className="py-2 pr-2">Balance</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-2 font-medium">{u.name} <span className="text-xs text-slate-400">({u.role})</span></td>
                    <td className="py-2 pr-2 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{u.accountNumber}</td>
                    <td className="py-2 pr-2 font-semibold">{formatNaira(u.balance)}</td>
                    <td className="py-2">
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setAccountNumber(u.accountNumber)}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold">Recorded activity</h2>
        {txns.length === 0 ? (
          <div className="mt-2"><Empty title="No activity recorded" /></div>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {txns.slice(0, 20).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{t.type} · {formatNaira(t.amount)}</p>
                  <p className="text-xs text-slate-500">
                    {t.senderAccountNumber || "—"} → {t.receiverAccountNumber || "—"} · {formatDate(t.timestamp)} · {t.status}
                    {t.adminEmail ? ` · by ${t.adminEmail}` : ""}
                  </p>
                </div>
                <span className="text-xs text-slate-400">#{t.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
