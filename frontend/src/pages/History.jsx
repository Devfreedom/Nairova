import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate, formatNaira, describeTransaction, signedAmount } from "../lib/format";
import { useAuth } from "../auth/AuthContext";
import { Alert, Empty, Skeleton, StatusPill } from "../components/ui";

function groupLabel(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function LedgerRow({ txn, selfId }) {
  const sign = signedAmount(txn, selfId);
  const incoming = sign >= 0;
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden="true" className={`disc ${incoming ? "disc-in" : "disc-out"}`}>
        {incoming ? "↓" : "↑"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-text truncate text-sm font-semibold">{describeTransaction(txn, selfId)}</p>
        <p className="t-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{formatDate(txn.timestamp)}</span>
          <StatusPill status={txn.status} />
          <span>Ref #{txn.id}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[15px] font-bold ${incoming ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
          {incoming ? "+" : "−"}{formatNaira(txn.amount)}
        </p>
        <p className="t-muted text-[11px] font-medium">{incoming ? "Credit" : "Debit"}</p>
      </div>
    </li>
  );
}

export default function History() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await api.transactions();
        setTxns(res.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const groups = txns.reduce((acc, t) => {
    const label = groupLabel(t.timestamp) || "Earlier";
    (acc[label] = acc[label] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <p className="eyebrow">Activity</p>
        <h1 className="t-text mt-1 text-2xl font-bold tracking-tight">Transaction history</h1>
        <p className="t-muted mt-0.5 text-sm">
          {loading ? "Fetching your records…" : txns.length === 0 ? "Only your own records, fetched from the API." : `${txns.length} record${txns.length === 1 ? "" : "s"} · yours only, newest first`}
        </p>
      </header>

      <div className="mt-4"><Alert>{error}</Alert></div>

      {loading ? (
        <div className="card mt-4" aria-label="Loading transactions">
          <div className="space-y-3 py-1">
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
          </div>
        </div>
      ) : txns.length === 0 ? (
        <div className="card mt-4">
          <Empty title="No transactions yet" hint="Simulated credits and transfers will appear here." />
          <Link to="/" className="btn-secondary mt-4 w-full">Back to dashboard</Link>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {Object.entries(groups).map(([label, items]) => (
            <section key={label} aria-label={label} className="card">
              <h2 className="eyebrow">{label}</h2>
              <ul className="t-border mt-1 divide-y">
                {items.map((t) => (
                  <LedgerRow key={t.id} txn={t} selfId={user?.id} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
