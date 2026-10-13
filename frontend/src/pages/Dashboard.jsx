import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate, formatNaira, describeTransaction, signedAmount } from "../lib/format";
import { useAuth, userIdentifier } from "../auth/AuthContext";
import { Alert, BrandMark, Empty, Icons, SectionHeading, Skeleton, StatusPill } from "../components/ui";

export function TransactionList({ txns, selfId }) {
  if (!txns.length) return <Empty title="No transactions yet" hint="Simulated credits and transfers will appear here." />;
  return (
    <ul className="t-border divide-y">
      {txns.map((t) => {
        const sign = signedAmount(t, selfId);
        const incoming = sign >= 0;
        return (
          <li key={t.id} className="t-border -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-2)]">
            <span aria-hidden="true" className={`disc ${incoming ? "disc-in" : "disc-out"}`}>
              {incoming ? "↓" : "↑"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-text truncate text-sm font-semibold">{describeTransaction(t, selfId)}</p>
              <p className="t-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span>{formatDate(t.timestamp)}</span>
                <StatusPill status={t.status} />
                <span>#{t.id}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`tnum text-sm font-bold ${incoming ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                {incoming ? "+" : "−"}{formatNaira(t.amount)}
              </p>
              <p className="t-muted text-[11px] font-medium">{incoming ? "Credit" : "Debit"}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatAccountDisplay(acct) {
  if (!acct) return "";
  const digits = String(acct).replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : acct;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [balance, setBalance] = useState(null);
  const [txns, setTxns] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [copyMsg, setCopyMsg] = useState("");

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

  async function handleCopyAccount() {
    setCopyMsg("");
    const acct = user?.accountNumber;
    if (!acct) {
      setCopyMsg("No account number available.");
      return;
    }
    try {
      await navigator.clipboard.writeText(String(acct));
      setCopyMsg("Account number copied");
    } catch {
      setCopyMsg("Copy failed — long-press to copy manually.");
    }
  }

  const [todayLine] = useState(
    () => new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Overview · {todayLine}</p>
          <h1 className="t-text mt-1 text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl">
            Welcome back, {firstName(user?.name)}
          </h1>
        </div>
        <p className="t-muted text-[13px]">{userIdentifier(user)}</p>
      </header>

      <section aria-label="Account overview" className="brand-panel overflow-hidden rounded-[20px] p-5 sm:p-7">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
            <BrandMark size={30} /> Nairova
          </span>
          <span className="rounded-full bg-mint px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink dark:bg-voltaic dark:text-midnight">
            Simulated
          </span>
        </div>

        <div className="mt-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Available balance</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <p className="tnum text-[38px] font-extrabold leading-none tracking-tight text-white sm:text-[44px]" aria-live="polite">
                {loading ? "…" : showBalance ? formatNaira(balance ?? 0) : "₦••••••"}
              </p>
              <button
                type="button"
                onClick={() => setShowBalance((v) => !v)}
                aria-label={showBalance ? "Hide balance" : "Show balance"}
                aria-pressed={showBalance}
                title={showBalance ? "Hide balance" : "Show balance"}
                className="rounded-full border border-white/25 p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden="true">{showBalance ? Icons.eye : Icons.eyeOff}</span>
              </button>
            </div>
          </div>
          <span aria-hidden="true" className="mt-1 hidden font-extrabold leading-none text-white/10 sm:block" style={{ fontSize: "5.5rem" }}>₦</span>
        </div>

        <div className="hairline mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Account number</p>
            <p className="tnum mt-1 font-mono text-lg font-bold tracking-[0.12em] text-white">
              {formatAccountDisplay(user?.accountNumber)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyAccount}
            aria-label="Copy account number"
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <span aria-hidden="true">{Icons.copy}</span> {copyMsg ? "Copied" : "Copy"}
          </button>
        </div>
        {copyMsg && <p role="status" className="mt-2 text-xs font-semibold text-mint dark:text-voltaic">{copyMsg}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Link to="/transfer" className="tile tile-mint">
            <span aria-hidden="true">{Icons.send}</span> Send money
          </Link>
          <Link to="/history" className="tile tile-ghost-light">
            <span aria-hidden="true">{Icons.clock}</span> View history
          </Link>
        </div>
      </section>

      <Alert>{error}</Alert>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <SectionHeading
            title="Recent activity"
            hint="Latest simulated transactions"
            action={txns.length > 0 && <Link to="/history" className="link-brand text-sm">View all →</Link>}
          />
          <div className="mt-1">
            {loading ? (
              <div className="space-y-2 py-2" aria-label="Loading transactions">
                <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
              </div>
            ) : (
              <TransactionList txns={txns} selfId={user?.id} />
            )}
          </div>
        </div>

        <div className="card card-muted lg:col-span-2">
          <p className="eyebrow">Security</p>
          <h2 className="t-text mt-1 text-base font-bold">Transaction PIN</h2>
          <p className="t-muted mt-0.5 text-[13px]">A 4-digit PIN is required before transfers. Manage it in Settings.</p>
          <Link to="/settings" className="btn-secondary mt-3 w-full">Open security settings</Link>
        </div>
      </div>
    </div>
  );
}
