import { Link } from "react-router-dom";
import { BrandMark, ThemeToggle } from "./ui";

// Split-screen auth shell: ~40% form panel, ~60% brand panel on desktop.
// On narrow screens the brand panel collapses so the form stays above the fold.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="t-bg relative flex min-h-screen">
      <div aria-hidden="true" className="auth-wipe pointer-events-none absolute inset-y-0 left-0 z-20 w-full bg-forest dark:bg-midnight" />
      <section aria-label="Sign in form" className="flex w-full flex-col px-6 py-6 sm:px-10 lg:w-[40%] lg:min-w-[380px]">
        <div className="anim-in flex items-center justify-between" style={{ "--d": "0.05s" }}>
          <Link to="/" className="flex items-center gap-2" aria-label="Nairova home">
            <BrandMark />
            <span className="t-text text-lg font-bold tracking-tight">Nairova</span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <h1 className="anim-in t-text text-2xl font-bold tracking-tight sm:text-[28px]" style={{ "--d": "0.12s" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="anim-in t-muted mt-1.5 text-[15px]" style={{ "--d": "0.18s" }}>
              {subtitle}
            </p>
          )}
          <div className="anim-in mt-6" style={{ "--d": "0.24s" }}>
            {children}
          </div>
          {footer && (
            <p className="anim-in t-muted mt-5 text-center text-sm" style={{ "--d": "0.3s" }}>
              {footer}
            </p>
          )}
        </div>
        <p className="t-muted text-center text-xs">Classroom simulator — all funds are simulated, not real money.</p>
      </section>
      <aside aria-hidden="true" className="anim-in relative hidden overflow-hidden bg-forest lg:block lg:w-[60%]" style={{ "--d": "0.2s" }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #10382F 0%, #176B50 70%, #0d2b25 100%)" }} />
        <svg className="absolute inset-0 h-full w-full opacity-20" preserveAspectRatio="none" viewBox="0 0 800 600">
          <g stroke="#B8F2D2" strokeWidth="1" fill="none">
            <circle cx="640" cy="120" r="180" />
            <circle cx="640" cy="120" r="120" />
            <circle cx="120" cy="520" r="150" />
            <path d="M0 480 L800 360" />
            <path d="M0 120 L800 40" />
          </g>
        </svg>
        <div className="relative flex h-full flex-col justify-between gap-8 p-12">
          <div>
            <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight text-white">
              Your money, <span style={{ color: "#B8F2D2" }}>clearly in view.</span>
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-emerald-100/90">
              <li className="flex items-center gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
                Verify recipients before sending
              </li>
              <li className="flex items-center gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
                PIN-protected simulated transfers
              </li>
              <li className="flex items-center gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
                Full transaction history
              </li>
            </ul>
          </div>
          <div className="anim-card relative max-w-sm">
            <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance preview</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Illustrative preview</span>
              </div>
              <p className="mt-1 text-3xl font-bold">₦••••••</p>
              <p className="mt-1 font-mono text-xs text-slate-500">•••• ••• ••••</p>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Sample transfer</span>
                  <span className="font-semibold text-rose-600">−₦••••</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sample credit</span>
                  <span className="font-semibold text-emerald-700">+₦••••</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -right-4 rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink shadow-lg">
              Receipt confirmed
            </div>
            <p className="mt-7 text-xs text-emerald-100/70">Illustrative preview — not your data.</p>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-emerald-100/90">
            Send simulated funds between classroom accounts, verify recipients, and review every transaction — clearly and calmly.
          </p>
        </div>
      </aside>
    </div>
  );
}
