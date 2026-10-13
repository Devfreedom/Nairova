import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setOnUnauthorized, setToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => logout());
    async function boot() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.me();
        setUser(res.data);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const res = await api.login({ email, password });
    setToken(res.token);
    const me = await api.me();
    setUser(me.data);
    return me.data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    await api.register({ name, email, password });
    return login(email, password);
  }, [login]);

  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me.data);
    return me.data;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, isAdmin: user?.role === "admin" }),
    [user, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
