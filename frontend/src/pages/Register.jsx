import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/AuthLayout";
import { Alert, Field, PasswordField, Icons } from "../components/ui";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!identifier.trim()) {
      setError("Enter an email address or a Nigerian phone number.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("Choose a 4-digit transaction PIN.");
      return;
    }
    if (pinConfirm !== pin) {
      setError("Transaction PIN confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      await register(name.trim(), identifier.trim(), password, pin, pinConfirm);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your Nairova account"
      subtitle="A simpler way to manage your account."
      footer={<>Already have an account? <Link to="/login" className="link-brand">Log in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Alert>{error}</Alert>
        <Field
          label="Full name"
          icon={Icons.user}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Adaeze Obi"
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="grid gap-5 min-[480px]:grid-cols-2 min-[480px]:gap-4">
          <label className="block" htmlFor="register-pin">
            <span className="label">Transaction PIN</span>
            <input
              id="register-pin"
              name="registerPin"
              className="field"
              type="password"
              autoComplete="new-password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <label className="block" htmlFor="register-pin-confirm">
            <span className="label">Confirm PIN</span>
            <input
              id="register-pin-confirm"
              name="registerPinConfirm"
              className="field"
              type="password"
              autoComplete="new-password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Repeat PIN"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
        </div>
        <p className="t-muted text-xs">Use 6+ characters with upper, lower, number and a symbol. Your 4-digit PIN approves transfers. Signups always create ordinary customer accounts.</p>
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthLayout>
  );
}
