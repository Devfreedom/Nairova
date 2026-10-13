import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert, Field } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      navigate(user?.role === "admin" ? "/admin" : "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Log in to view your balance and transactions.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn-primary" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        </form>
        <p className="mt-3 text-sm text-slate-500">
          New here? <Link to="/register" className="font-medium text-emerald-700 hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
