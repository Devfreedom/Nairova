export function Alert({ kind = "error", children }) {
  if (!children) return null;
  const styles =
    kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" {...props} />
    </label>
  );
}

export function PasswordField({ label, id, ...props }) {
  const [visible, setVisible] = useState(false);
  const inputId = id || `password-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="block">
      <label className="label" htmlFor={inputId}>{label}</label>
      <span className="relative block">
        <input id={inputId} className="field pr-16" {...props} type={visible ? "text" : "password"} />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </div>
  );
}

export function Empty({ title, hint }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
