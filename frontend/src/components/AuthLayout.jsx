import { Link } from "react-router-dom";
import { BrandMark, ThemeToggle } from "./ui";


export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="t-bg relative flex min-h-screen">
      <div aria-hidden="true" className="auth-wipe pointer-events-none absolute inset-y-0 left-0 z-20 w-full bg-forest dark:bg-midnight" />
      <section aria-label="Sign in form" className="flex w-full flex-col px-6 py-6 sm:px-10 lg:w-[40%] lg:min-w-[400px] lg:px-12">
        <div className="anim-in flex items-center justify-between" style={{ "--d": "0.05s" }}>
          <Link to="/" className="group flex items-center gap-2.5" aria-label="Nairova home">
            <BrandMark size={38} />
            <span className="t-text text-[19px] font-extrabold tracking-tight">Nairova</span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="anim-in t-text text-[30px] font-extrabold leading-[1.12] tracking-tight sm:text-[32px]" style={{ "--d": "0.12s" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="anim-in t-muted mt-2 text-base leading-relaxed" style={{ "--d": "0.18s" }}>
              {subtitle}
            </p>
          )}
          <div className="anim-in mt-7" style={{ "--d": "0.24s" }}>
            {children}
          </div>
          {footer && (
            <p className="anim-in t-muted mt-6 border-t pt-5 text-center text-sm hairline" style={{ "--d": "0.3s" }}>
              {footer}
            </p>
          )}
        </div>
      </section>
      <aside aria-hidden="true" className="anim-in relative hidden overflow-hidden bg-forest lg:block lg:w-[60%]" style={{ "--d": "0.2s" }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(150deg, #1a5a44 0%, #10382F 52%, #0a241e 100%)" }} />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full" style={{ background: "radial-gradient(circle, rgba(184,242,210,0.16) 0%, transparent 70%)" }} />
        <svg className="absolute inset-0 h-full w-full opacity-25" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 600">
          <g stroke="#B8F2D2" strokeWidth="1" fill="none">
            <circle cx="660" cy="110" r="190" />
            <circle cx="660" cy="110" r="130" />
            <circle cx="660" cy="110" r="70" />
            <circle cx="90" cy="540" r="150" />
            <path d="M0 470 L800 350" />
          </g>
        </svg>
        <div className="relative flex h-full flex-col px-12 py-12 xl:px-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/70">
            Nairova
          </p>
          <div className="mt-8 max-w-lg">
            <p className="text-[44px] font-extrabold leading-[1.05] tracking-tight text-white xl:text-[52px]">
              Your money,<br />
              <span style={{ color: "#B8F2D2" }}>clearly in view.</span>
            </p>
          </div>
          <ul className="mt-8 max-w-md divide-y divide-white/10 border-y border-white/10 text-sm text-emerald-50/95">
            <li className="flex items-center gap-3 py-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
              <span><strong className="font-semibold">Verify recipients</strong> <span className="text-emerald-100/70">before sending a kobo</span></span>
            </li>
            <li className="flex items-center gap-3 py-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
              <span><strong className="font-semibold">PIN-protected transfers</strong> <span className="text-emerald-100/70">confirmed by the server</span></span>
            </li>
            <li className="flex items-center gap-3 py-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "#B8F2D2", color: "#10382F" }}>✓</span>
              <span><strong className="font-semibold">Full history</strong> <span className="text-emerald-100/70">for every classroom account</span></span>
            </li>
          </ul>
          <div className="anim-card mt-auto flex items-end pt-10" aria-hidden="true">
            <span className="font-extrabold leading-none tracking-tight" style={{ fontSize: "9rem", color: "transparent", WebkitTextStroke: "2px rgba(184, 242, 210, 0.5)" }}>
              ₦
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
