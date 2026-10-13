import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/AuthLayout";
import { Alert, Field, PasswordField, Icons } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Email or phone number and password are required.");
      return;
    }
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password);
      navigate(user?.role === "admin" ? "/admin" : "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Your money, clearly in view."
      footer={<>New to Nairova? <Link to="/register" className="link-brand">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
        <Alert>{error}</Alert>
        <Field
          label="Email or phone number"
          icon={Icons.id}
          type="text"
          autoComplete="username"
          placeholder="you@example.com or 08012345678"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <PasswordField
          label="Password"
          icon={Icons.lock}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn-primary" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
    </AuthLayout>
  );
}
