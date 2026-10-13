import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-100"}`
      }
    >
      {children}
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">₦</span>
            <span className="font-bold text-slate-900">BankApp <span className="font-normal text-slate-500">Classroom</span></span>
          </Link>
          {user ? (
            <nav className="flex items-center gap-1">
              <NavItem to="/">Home</NavItem>
              <NavItem to="/transfer">Transfer</NavItem>
              <NavItem to="/history">History</NavItem>
              {isAdmin && <NavItem to="/admin">Admin</NavItem>}
              <button onClick={handleLogout} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
                Logout
              </button>
            </nav>
          ) : (
            <nav className="flex items-center gap-1">
              <NavItem to="/login">Login</NavItem>
              <NavItem to="/register">Register</NavItem>
            </nav>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </div>
    </div>
  );
}
