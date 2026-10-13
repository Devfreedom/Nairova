import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate, formatNaira, describeTransaction, signedAmount } from "../lib/format";
import { useAuth } from "../auth/AuthContext";
import { Alert, Empty, SectionHeading, Skeleton, StatusPill } from "../components/ui";

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

  const rows = txns.reduce((acc, t) => {
    const group = groupLabel(t.timestamp) || "";
    acc.items.push({ txn: t, group, showGroup: group !== acc.last });
    acc.last = group;
    return acc;
  }, { last: "", items: [] }).items;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card">
        <SectionHeading title="Transaction history" hint="Only your own records, fetched from the API." />
        <div className="mt-3">
          <Alert>{error}</Alert>
          {loading ? (
            <div className="space-y-2 py-2" aria-label="Loading transactions">
              <Skeleton /><Skeleton /><Skeleton /><Skeleton />
            </div>
          ) : txns.length === 0 ? (
            <Empty title="No transactions yet" hint="Simulated credits and transfers will appear here." />
          ) : (
            <ul className="t-border divide-y">
              {rows.map(({ txn: t, group, showGroup }) => {
                const sign = signedAmount(t, user?.id);
                const incoming = sign >= 0;
                return (
                  <li key={t.id}>
                    {showGroup && group && (
                      <p className="t-muted pt-3 text-xs font-semibold uppercase tracking-wide">{group}</p>
                    )}
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="t-text truncate text-sm font-medium">{describeTransaction(t, user?.id)}</p>
                        <p className="t-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span>{formatDate(t.timestamp)}</span>
                          <StatusPill status={t.status} />
                          <span>#{t.id}</span>
                        </p>
                      </div>
                      <p className={`shrink-0 text-sm font-bold ${incoming ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                        {incoming ? "+" : "−"}{formatNaira(t.amount)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
