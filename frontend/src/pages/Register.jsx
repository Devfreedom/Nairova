import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert, Field, PasswordField } from "../components/ui";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-xl font-bold">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">Signups always create ordinary customer accounts.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <PasswordField label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-slate-500">Use 6+ characters with upper, lower, number and a symbol.</p>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Register"}</button>
        </form>
        <p className="mt-3 text-sm text-slate-500">
          Have an account? <Link to="/login" className="font-medium text-emerald-700 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
