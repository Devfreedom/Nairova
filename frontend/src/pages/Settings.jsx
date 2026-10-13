import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useTheme, THEME_OPTIONS } from "../theme/ThemeContext";
import { Alert } from "../components/ui";

function Section({ id, eyebrow, title, hint, children }) {
  return (
    <section aria-labelledby={id} className="card">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="t-text mt-1 text-base font-bold">{title}</h2>
      {hint && <p className="t-muted mt-0.5 text-[13px]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`t-border flex items-start gap-3 rounded-xl border px-3.5 py-3 ${disabled ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-strong)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="min-w-0">
        <span className="t-text block text-sm font-bold">{label}</span>
        {hint && <span className="t-muted mt-0.5 block text-xs">{hint}</span>}
      </span>
    </label>
  );
}

const DEFAULT_PREFS = { inappMoneyEvents: true, emailMoneyEvents: false, emailMarketing: false, theme: "system" };

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { choice, setTheme } = useTheme();

  // ---- Profile ----
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileBaseline, setProfileBaseline] = useState(null);
  const [profileMsg, setProfileMsg] = useState({ kind: "", text: "" });
  const [profileBusy, setProfileBusy] = useState(false);

  // ---- Email verification ----
  const [verifyToken, setVerifyToken] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [noProvider, setNoProvider] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState({ kind: "", text: "" });
  const [verifyBusy, setVerifyBusy] = useState(false);

  // ---- Notification preferences ----
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [prefsBaseline, setPrefsBaseline] = useState(DEFAULT_PREFS);
  const [prefsMsg, setPrefsMsg] = useState({ kind: "", text: "" });
  const [prefsBusy, setPrefsBusy] = useState(false);

  // ---- Security: PIN ----
  const [pin, setPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState({ kind: "", text: "" });
  const [pinBusy, setPinBusy] = useState(false);

  // ---- Security: password ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState({ kind: "", text: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);

  // ---- Appearance ----
  const [themeMsg, setThemeMsg] = useState({ kind: "", text: "" });
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    async function sync() {
      if (!user) return;
      const snap = { name: user.name ?? "", email: user.email ?? "", phone: user.phone ?? "" };
      setName(snap.name);
      setEmail(snap.email);
      setPhone(snap.phone);
      setProfileBaseline(snap);
      const p = { ...DEFAULT_PREFS, ...(user.preferences || {}) };
      setPrefs(p);
      setPrefsBaseline(p);
    }
    sync();
  }, [user?.id]);

  const profileDirty =
    profileBaseline &&
    (name !== profileBaseline.name || email !== profileBaseline.email || phone !== profileBaseline.phone);
  const prefsDirty = JSON.stringify(prefs) !== JSON.stringify(prefsBaseline);
  const emailVerified = user?.emailVerified === true;

  async function handleProfileSave(e) {
    e.preventDefault();
    if (profileBusy || !profileDirty) return;
    setProfileMsg({ kind: "", text: "" });
    setProfileBusy(true);
    try {
      const payload = {};
      if (name !== profileBaseline.name) payload.name = name.trim();
      if (email !== profileBaseline.email) payload.email = email.trim();
      if (phone !== profileBaseline.phone) payload.phone = phone.trim();
      const res = await api.profile(payload);
      setProfileBaseline({ name: res.data.name ?? "", email: res.data.email ?? "", phone: res.data.phone ?? "" });
      setProfileMsg({ kind: "success", text: res.message });
      await refreshUser().catch(() => {});
    } catch (err) {
      setProfileMsg({ kind: "error", text: err.message });
    } finally {
      setProfileBusy(false);
    }
  }

  function handleProfileCancel() {
    if (!profileBaseline) return;
    setName(profileBaseline.name);
    setEmail(profileBaseline.email);
    setPhone(profileBaseline.phone);
    setProfileMsg({ kind: "", text: "" });
  }

  async function handleRequestToken() {
    if (verifyBusy) return;
    setVerifyMsg({ kind: "", text: "" });
    setIssuedToken("");
    setNoProvider(false);
    setVerifyBusy(true);
    try {
      const res = await api.requestEmailVerification();
      if (res.data?.alreadyVerified) {
        setVerifyMsg({ kind: "success", text: res.message });
      } else {
        setVerifyMsg({ kind: "success", text: res.message });
        if (res.data?.verificationToken) setIssuedToken(res.data.verificationToken);
        if (res.data?.verificationSent === false) setNoProvider(true);
      }
      await refreshUser().catch(() => {});
    } catch (err) {
      setVerifyMsg({ kind: "error", text: err.message });
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (verifyBusy) return;
    setVerifyMsg({ kind: "", text: "" });
    if (!verifyToken.trim()) {
      setVerifyMsg({ kind: "error", text: "Enter the verification token." });
      return;
    }
    setVerifyBusy(true);
    try {
      const res = await api.verifyEmail(verifyToken.trim());
      setVerifyMsg({ kind: "success", text: res.message });
      setVerifyToken("");
      setIssuedToken("");
      await refreshUser().catch(() => {});
    } catch (err) {
      setVerifyMsg({ kind: "error", text: err.message });
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handlePrefsSave(e) {
    e.preventDefault();
    if (prefsBusy || !prefsDirty) return;
    setPrefsMsg({ kind: "", text: "" });
    setPrefsBusy(true);
    try {
      const changed = {};
      for (const k of Object.keys(DEFAULT_PREFS)) {
        if (k === "theme") continue;
        if (prefs[k] !== prefsBaseline[k]) changed[k] = prefs[k];
      }
      const res = await api.updatePreferences(changed);
      setPrefsBaseline({ ...DEFAULT_PREFS, ...res.data });
      setPrefsMsg({ kind: "success", text: res.message });
      await refreshUser().catch(() => {});
    } catch (err) {
      setPrefsMsg({ kind: "error", text: err.message });
    } finally {
      setPrefsBusy(false);
    }
  }

  async function handleThemeSelect(t) {
    if (themeBusy || t === choice) return;
    setThemeMsg({ kind: "", text: "" });
    setThemeBusy(true);
    const previous = choice;
    try {
      await api.updatePreferences({ theme: t });
      setTheme(t);
      setPrefs((p) => ({ ...p, theme: t }));
      setPrefsBaseline((p) => ({ ...p, theme: t }));
      setThemeMsg({ kind: "success", text: `Appearance set to ${t}.` });
      await refreshUser().catch(() => {});
    } catch (err) {
      setTheme(previous);
      setThemeMsg({ kind: "error", text: err.message });
    } finally {
      setThemeBusy(false);
    }
  }

  async function handleCreatePin(e) {
    e.preventDefault();
    if (pinBusy) return;
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
    if (pinBusy) return;
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

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (passwordBusy) return;
    setPasswordMsg({ kind: "", text: "" });
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: "error", text: "New password confirmation does not match." });
      return;
    }
    setPasswordBusy(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setPasswordMsg({ kind: "success", text: res.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMsg({ kind: "error", text: err.message });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="t-text mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">Settings</h1>
        <p className="t-muted mt-0.5 text-sm">Profile, verification, notifications, security and appearance.</p>
      </header>

      <Section id="settings-profile" eyebrow="Profile" title="Contact details" hint="Phone-only accounts stay valid. Changing your email resets its verification.">
        <Alert kind={profileMsg.kind}>{profileMsg.text}</Alert>
        <form onSubmit={handleProfileSave} className="mt-3 space-y-4">
          <label className="block" htmlFor="settings-name">
            <span className="label">Full name</span>
            <input id="settings-name" name="settingsName" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block" htmlFor="settings-email">
            <span className="label">Email address (optional)</span>
            <input id="settings-email" name="settingsEmail" className="field" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block" htmlFor="settings-phone">
            <span className="label">Phone number (optional)</span>
            <input id="settings-phone" name="settingsPhone" className="field" inputMode="tel" autoComplete="tel" placeholder="08012345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <p className="t-muted text-xs">Account {user?.accountNumber ? <span className="font-mono">{user.accountNumber}</span> : "—"} · at least one of email or phone is required.</p>
          <div className="grid gap-2 min-[480px]:grid-cols-2">
            <button type="button" className="btn-secondary" disabled={profileBusy || !profileDirty} onClick={handleProfileCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={profileBusy || !profileDirty}>
              {profileBusy ? "Saving…" : "Save changes"}
            </button>
          </div>
          {profileDirty && <p className="t-muted text-xs">You have unsaved changes.</p>}
        </form>
      </Section>

      <Section id="settings-email" eyebrow="Verification" title="Email verification" hint="Your address is verified only through a single-use token.">
        <Alert kind={verifyMsg.kind}>{verifyMsg.text}</Alert>
        <div className="mt-3">
          {emailVerified ? (
            <p role="status" className="t-text text-sm font-semibold">
              ✓ {user?.email} is verified.
            </p>
          ) : user?.email ? (
            <p className="t-muted text-sm">
              <span className="t-text font-semibold">{user.email}</span> is not verified yet.
            </p>
          ) : (
            <p className="t-muted text-sm">Add an email address above before requesting a token.</p>
          )}
        </div>
        {!emailVerified && user?.email && (
          <div className="mt-3 space-y-3">
            <button type="button" className="btn-secondary" disabled={verifyBusy} onClick={handleRequestToken}>
              {verifyBusy ? "…" : "Request verification token"}
            </button>
            {noProvider && (
              <p className="t-muted text-xs">No mail provider is configured, so no email was sent. The token below is a development affordance and never appears in production responses.</p>
            )}
            {issuedToken && (
              <label className="block" htmlFor="settings-issued-token">
                <span className="label">Your token (development only — paste it below)</span>
                <input id="settings-issued-token" name="settingsIssuedToken" className="field font-mono text-xs" readOnly value={issuedToken} onFocus={(e) => e.target.select()} />
              </label>
            )}
            <form onSubmit={handleVerify} className="space-y-3">
              <label className="block" htmlFor="settings-token">
                <span className="label">Verification token</span>
                <input id="settings-token" name="settingsToken" className="field font-mono" autoComplete="off" placeholder="Paste the 64-character token" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value.trim())} />
              </label>
              <button type="submit" className="btn-primary" disabled={verifyBusy}>
                {verifyBusy ? "Verifying…" : "Verify email"}
              </button>
            </form>
          </div>
        )}
      </Section>

      <Section id="settings-notifications" eyebrow="Notifications" title="Notification preferences" hint="In-app notifications stay on unless you opt out. Email options need a verified address.">
        <Alert kind={prefsMsg.kind}>{prefsMsg.text}</Alert>
        <form onSubmit={handlePrefsSave} className="mt-3 space-y-3">
          <Toggle
            label="In-app money notifications"
            hint="Transfers sent and received, deposits and simulated credits in the notification centre."
            checked={prefs.inappMoneyEvents}
            onChange={(v) => setPrefs((p) => ({ ...p, inappMoneyEvents: v }))}
          />
          <Toggle
            label="Email money notifications"
            hint={emailVerified ? "Requires a verified address. No mail provider is configured yet, so nothing is delivered." : "Verify your email address above to enable this."}
            checked={prefs.emailMoneyEvents}
            onChange={(v) => setPrefs((p) => ({ ...p, emailMoneyEvents: v }))}
            disabled={!emailVerified}
          />
          <Toggle
            label="Email marketing"
            hint={emailVerified ? "Optional product updates. Off unless you opt in." : "Verify your email address above to enable this."}
            checked={prefs.emailMarketing}
            onChange={(v) => setPrefs((p) => ({ ...p, emailMarketing: v }))}
            disabled={!emailVerified}
          />
          <button type="submit" className="btn-primary" disabled={prefsBusy || !prefsDirty}>
            {prefsBusy ? "Saving…" : "Save preferences"}
          </button>
          {prefsDirty && <p className="t-muted text-xs">You have unsaved changes.</p>}
        </form>
      </Section>

      <Section id="settings-security" eyebrow="Security" title="Password and transaction PIN" hint="A 4-digit PIN is required before transfers.">
        <div><Alert kind={pinMsg.kind}>{pinMsg.text}</Alert></div>
        <form onSubmit={handleCreatePin} className="mt-3 space-y-2">
          <label className="block" htmlFor="settings-pin-create">
            <span className="label">Create PIN (for accounts without one)</span>
            <span className="flex gap-2">
              <input id="settings-pin-create" name="settingsPinCreate" className="field" inputMode="numeric" maxLength={4} placeholder="1234" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="Create transaction PIN" />
              <button type="submit" className="btn-secondary shrink-0" disabled={pinBusy}>Save</button>
            </span>
          </label>
        </form>
        <form onSubmit={handleUpdatePin} className="t-border mt-3 space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block" htmlFor="settings-pin-old">
              <span className="label">Old PIN</span>
              <input id="settings-pin-old" name="settingsPinOld" className="field" inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} aria-label="Old transaction PIN" />
            </label>
            <label className="block" htmlFor="settings-pin-new">
              <span className="label">New PIN</span>
              <input id="settings-pin-new" name="settingsPinNew" className="field" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} aria-label="New transaction PIN" />
            </label>
          </div>
          <button type="submit" className="btn-secondary w-full" disabled={pinBusy}>Update PIN</button>
        </form>
        <div className="mt-2"><Alert kind={passwordMsg.kind}>{passwordMsg.text}</Alert></div>
        <form onSubmit={handlePasswordChange} className="t-border mt-3 space-y-4 border-t pt-3">
          <label className="block" htmlFor="settings-password-current">
            <span className="label">Current password</span>
            <input id="settings-password-current" name="settingsPasswordCurrent" className="field" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <div className="grid gap-4 min-[480px]:grid-cols-2 min-[480px]:gap-3">
            <label className="block" htmlFor="settings-password-new">
              <span className="label">New password</span>
              <input id="settings-password-new" name="settingsPasswordNew" className="field" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </label>
            <label className="block" htmlFor="settings-password-confirm">
              <span className="label">Confirm new password</span>
              <input id="settings-password-confirm" name="settingsPasswordConfirm" className="field" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </label>
          </div>
          <p className="t-muted text-xs">Use 6+ characters with upper, lower, number and a symbol. Your other sessions stay signed in.</p>
          <button type="submit" className="btn-primary" disabled={passwordBusy}>
            {passwordBusy ? "Changing…" : "Change password"}
          </button>
        </form>
      </Section>

      <Section id="settings-appearance" eyebrow="Appearance" title="Theme" hint="System follows your device setting and updates automatically.">
        <Alert kind={themeMsg.kind}>{themeMsg.text}</Alert>
        <div role="radiogroup" aria-label="Theme" className="mt-3 grid gap-2 min-[480px]:grid-cols-3">
          {THEME_OPTIONS.map((t) => (
            <label
              key={t}
              className={`t-border flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 ${choice === t ? "bg-[var(--surface-2)]" : ""}`}
            >
              <input
                type="radio"
                name="settingsTheme"
                value={t}
                checked={choice === t}
                onChange={() => handleThemeSelect(t)}
                disabled={themeBusy}
                className="h-4 w-4 shrink-0 accent-[var(--brand-strong)]"
              />
              <span className="t-text text-sm font-bold capitalize">{t}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
