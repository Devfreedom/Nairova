import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./auth/AuthContext";
import { UnreadProvider } from "./notifications/UnreadContext";
import { useTheme } from "./theme/ThemeContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Transfer from "./pages/Transfer";
import History from "./pages/History";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Layout><p className="t-muted py-10 text-center text-sm">Loading…</p></Layout>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Layout><p className="t-muted py-10 text-center text-sm">Loading…</p></Layout>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

// Applies the authenticated user's saved theme after login/boot.
// Local choice (pre-login) is left alone until a server value arrives.
function ThemeHydrator() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const serverTheme = user?.preferences?.theme;
  useEffect(() => {
    async function boot() {
      if (serverTheme) setTheme(serverTheme);
    }
    boot();
  }, [serverTheme, setTheme]);
  return null;
}

export default function App() {
  return (
    <UnreadProvider>
    <ThemeHydrator />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/transfer" element={<RequireAuth><Transfer /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </UnreadProvider>
  );
}
