import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate, formatNaira, describeTransaction, signedAmount } from "../lib/format";
import { useAuth } from "../auth/AuthContext";
import { Alert, Empty } from "../components/ui";

export function TransactionList({ txns, selfId }) {
  if (!txns.length) return <Empty title="No transactions yet" hint="Simulated credits and transfers will appear here." />;
  return (
    <ul className="divide-y divide-slate-100">
      {txns.map((t) => {
        const sign = signedAmount(t, selfId);
        return (
          <li key={t.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{describeTransaction(t, selfId)}</p>
              <p className="text-xs text-slate-500">
                {formatDate(t.timestamp)} · {t.status} · #{t.id}
              </p>
            </div>
            <p className={`text-sm font-bold ${sign < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {sign < 0 ? "−" : "+"}{formatNaira(t.amount)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [balance, setBalance] = useState(null);
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState({ kind: "", text: "" });
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [b, t] = await Promise.all([api.balance(), api.transactions()]);
        setBalance(b.balance);
        setTxns((t.data || []).slice(0, 5));
        await refreshUser().catch(() => {});
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshUser]);

  async function handleCreatePin(e) {
    e.preventDefault();
    setPinMsg({ kind: "", text: "" });
    if (!/^\d{4}$/.test(pin)) {
      setPinMsg({ kind: "error", text: "PIN must be exactly 4 digits." });
      return;
    }
    setPinBusy(true);
    try {
      await api.createPin(pin);
      setPinMsg({ kind: "success", text: "Transaction PIN created." });
      setPin("");
    } catch (err) {
      setPinMsg({ kind: "error", text: err.message });
    } finally {
      setPinBusy(false);
    }
  }

  async function handleUpdatePin(e) {
    e.preventDefault();
    setPinMsg({ kind: "", text: "" });
    if (!/^\d{4}$/.test(newPin)) {
      setPinMsg({ kind: "error", text: "New PIN must be exactly 4 digits." });
      return;
    }
    setPinBusy(true);
    try {
      await api.updatePin(oldPin, newPin);
      setPinMsg({ kind: "success", text: "Transaction PIN updated." });
      setOldPin("");
      setNewPin("");
    } catch (err) {
      setPinMsg({ kind: "error", text: err.message });
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card bg-gradient-to-br from-emerald-800 to-emerald-600 text-white">
        <p className="text-xs uppercase tracking-wide text-emerald-100">Hello, {user?.name}</p>
        <p className="mt-1 text-sm text-emerald-100">Acct {user?.accountNumber} · {user?.email}</p>
        <p className="mt-3 text-xs uppercase tracking-wide text-emerald-100">Available balance</p>
        <p className="text-3xl font-bold">{loading ? "…" : formatNaira(balance ?? 0)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/transfer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800">Send money</Link>
          <Link to="/history" className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white">History</Link>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Recent activity</h2>
          <div className="mt-2"><TransactionList txns={txns} selfId={user?.id} /></div>
          {txns.length > 0 && (
            <Link to="/history" className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline">View all →</Link>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold">Transaction PIN</h2>
          <p className="mt-1 text-sm text-slate-500">A 4-digit PIN is required before transfers.</p>
          <Alert kind={pinMsg.kind}>{pinMsg.text}</Alert>
          <form onSubmit={handleCreatePin} className="mt-3 space-y-2">
            <label className="block">
              <span className="label">Create PIN</span>
              <span className="flex gap-2">
                <input className="field" inputMode="numeric" maxLength={4} placeholder="1234" value={pin} onChange={(e) => setPin(e.target.value)} />
                <button className="btn-secondary" disabled={pinBusy}>Save</button>
              </span>
            </label>
          </form>
          <form onSubmit={handleUpdatePin} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Old PIN</span>
                <input className="field" inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">New PIN</span>
                <input className="field" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value)} />
              </label>
            </div>
            <button className="btn-secondary w-full" disabled={pinBusy}>Update PIN</button>
          </form>
        </div>
      </div>
    </div>
  );
}
