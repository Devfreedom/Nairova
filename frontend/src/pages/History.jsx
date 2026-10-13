import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/ui";
import { TransactionList } from "./Dashboard";

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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card">
        <h1 className="text-xl font-bold">Transaction history</h1>
        <p className="mt-1 text-sm text-slate-500">Only your own records, fetched from the API.</p>
        <div className="mt-3">
          <Alert>{error}</Alert>
          {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : <TransactionList txns={txns} selfId={user?.id} />}
        </div>
      </div>
    </div>
  );
}
