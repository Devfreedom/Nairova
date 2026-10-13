import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth, userIdentifier } from "../auth/AuthContext";
import { BrandMark, Icons, ThemeToggle } from "./ui";

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function SideLink({ to, icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidelink ${isActive ? "sidelink-active" : ""}`}
    >
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      {children}
    </NavLink>
  );
}

function TabItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className="flex min-h-[58px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold"
      style={({ isActive }) => ({
        color: isActive ? "var(--brand-strong)" : "var(--muted)",
        background: isActive ? "var(--surface-2)" : "transparent",
        boxShadow: isActive ? "inset 0 0 0 1px var(--border)" : "none",
      })}
    >
      {({ isActive }) => (
        <>
          <span aria-hidden="true">{icon}</span>
          <span>{label}</span>
          <span aria-hidden="true" className="h-1 w-6 rounded-full" style={{ background: isActive ? "var(--brand-strong)" : "transparent" }} />
        </>
      )}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="t-bg min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="t-surface t-border sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r px-4 py-5 md:flex" aria-label="Primary">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1">
          <BrandMark size={38} />
          <span className="t-text text-[18px] font-extrabold tracking-tight">Nairova</span>
        </Link>
        <nav className="mt-7 flex flex-1 flex-col gap-1">
          <p className="eyebrow px-3 pb-1.5">Menu</p>
          <SideLink to="/" end icon={Icons.home}>Dashboard</SideLink>
          <SideLink to="/transfer" icon={Icons.send}>Transfer</SideLink>
          <SideLink to="/history" icon={Icons.clock}>History</SideLink>
          {isAdmin && (
            <>
              <p className="eyebrow px-3 pb-1.5 pt-4">Manage</p>
              <SideLink to="/admin" icon={Icons.shield}>Admin</SideLink>
            </>
          )}
        </nav>
        <div className="t-border border-t pt-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="t-muted text-xs font-semibold uppercase tracking-wide">Theme</span>
            <ThemeToggle />
          </div>
          {user ? (
            <div className="t-surface-2 flex items-center gap-2.5 rounded-2xl p-2.5">
              <span aria-hidden="true" className="t-text flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-extrabold">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-text truncate text-[13px] font-bold">{user.name}</p>
                <p className="t-muted truncate text-xs">{userIdentifier(user)}</p>
              </div>
              <button onClick={handleLogout} className="t-muted shrink-0 rounded-lg px-2 py-1 text-xs font-bold hover:text-[var(--text)] hover:underline">
                Logout
              </button>
            </div>
          ) : (
            <nav className="flex flex-col gap-1">
              <SideLink to="/login" icon={Icons.user}>Login</SideLink>
              <SideLink to="/register" icon={Icons.id}>Register</SideLink>
            </nav>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="t-surface t-border sticky top-0 z-10 border-b md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <BrandMark size={32} />
              <span className="t-text text-[17px] font-extrabold tracking-tight">Nairova</span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {user && (
                <button onClick={handleLogout} className="t-muted rounded-lg px-2 py-1 text-sm font-semibold">
                  Logout
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 md:pb-10">
          {children}
        </main>

        {/* Mobile-only bottom tab bar */}
        {user && (
          <nav
            aria-label="Primary"
            className="t-surface t-border fixed inset-x-0 bottom-0 z-10 flex gap-1 border-t px-3 pt-2 md:hidden"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            <TabItem to="/" end icon={Icons.home} label="Home" />
            <TabItem to="/transfer" icon={Icons.send} label="Transfer" />
            <TabItem to="/history" icon={Icons.clock} label="History" />
            {isAdmin && <TabItem to="/admin" icon={Icons.shield} label="Admin" />}
          </nav>
        )}
      </div>
    </div>
  );
}
