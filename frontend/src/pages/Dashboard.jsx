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
          <li key={t.id} className="flex items-center gap-3 py-3">
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
              <p className={`text-sm font-bold ${incoming ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
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
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Overview</p>
        <h1 className="t-text mt-1 text-2xl font-bold tracking-tight">Welcome back, {firstName(user?.name)}</h1>
        <p className="t-muted mt-0.5 text-sm">{userIdentifier(user)} · All funds simulated</p>
      </header>

      <section aria-label="Account overview" className="card overflow-hidden !p-0">
        <div className="flex items-center justify-between bg-forest px-5 py-3.5 dark:bg-deepsea">
          <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-white">
            <BrandMark size={28} /> Nairova
          </span>
          <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink dark:bg-voltaic dark:text-midnight">
            Simulated
          </span>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Available balance</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="t-text text-[32px] font-bold leading-none tracking-tight" aria-live="polite">
                  {loading ? "…" : showBalance ? formatNaira(balance ?? 0) : "₦••••••"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowBalance((v) => !v)}
                  aria-label={showBalance ? "Hide balance" : "Show balance"}
                  aria-pressed={showBalance}
                  title={showBalance ? "Hide balance" : "Show balance"}
                  className="t-muted rounded-lg p-2 hover:text-[var(--text)]"
                >
                  <span aria-hidden="true">{showBalance ? Icons.eye : Icons.eyeOff}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="t-border mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
            <div>
              <p className="eyebrow">Account number</p>
              <p className="t-text mt-0.5 font-mono text-[15px] font-semibold tracking-wider">
                {formatAccountDisplay(user?.accountNumber)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyAccount}
              aria-label="Copy account number"
              className="btn-secondary ml-auto px-3 py-1.5 text-xs"
            >
              <span aria-hidden="true" className="mr-1.5">{Icons.copy}</span> Copy
            </button>
          </div>
          {copyMsg && <p role="status" className="mt-2 text-xs font-semibold text-[var(--ok)]">{copyMsg}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/transfer" className="tile tile-solid">
              <span aria-hidden="true">{Icons.send}</span> Send money
            </Link>
            <Link to="/history" className="tile">
              <span aria-hidden="true">{Icons.clock}</span> View history
            </Link>
          </div>
        </div>
      </section>

      <Alert>{error}</Alert>

      <div className="grid items-start gap-4 md:grid-cols-5">
        <div className="card md:col-span-3">
          <SectionHeading
            title="Recent activity"
            hint="Latest simulated transactions"
            action={txns.length > 0 && <Link to="/history" className="link-brand text-sm">View all →</Link>}
          />
          <div className="mt-2">
            {loading ? (
              <div className="space-y-2 py-2" aria-label="Loading transactions">
                <Skeleton /><Skeleton /><Skeleton />
              </div>
            ) : (
              <TransactionList txns={txns} selfId={user?.id} />
            )}
          </div>
        </div>

        <div className="card card-muted md:col-span-2">
          <p className="eyebrow">Security</p>
          <h2 className="t-text mt-1 text-base font-bold">Transaction PIN</h2>
          <p className="t-muted mt-0.5 text-[13px]">A 4-digit PIN is required before transfers.</p>
          <div className="mt-2"><Alert kind={pinMsg.kind}>{pinMsg.text}</Alert></div>
          <form onSubmit={handleCreatePin} className="mt-3 space-y-2">
            <label className="block">
              <span className="label">Create PIN</span>
              <span className="flex gap-2">
                <input className="field" inputMode="numeric" maxLength={4} placeholder="1234" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Create transaction PIN" />
                <button className="btn-secondary shrink-0" disabled={pinBusy}>Save</button>
              </span>
            </label>
          </form>
          <form onSubmit={handleUpdatePin} className="t-border mt-3 space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Old PIN</span>
                <input className="field" inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value)} aria-label="Old transaction PIN" />
              </label>
              <label className="block">
                <span className="label">New PIN</span>
                <input className="field" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value)} aria-label="New transaction PIN" />
              </label>
            </div>
            <button className="btn-secondary w-full" disabled={pinBusy}>Update PIN</button>
          </form>
        </div>
      </div>
    </div>
  );
}
