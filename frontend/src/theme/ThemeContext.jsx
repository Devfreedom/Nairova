import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nairova-theme";
const THEME_OPTIONS = ["light", "dark", "system"];

const ThemeContext = createContext({ theme: "light", choice: "system", setTheme: () => {}, toggle: () => {} });

function readSavedChoice() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEME_OPTIONS.includes(saved)) return saved;
  } catch {
    // storage unavailable; fall through to system
  }
  return "system";
}

function systemPrefersDark() {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return true;
  }
  return false;
}

export function ThemeProvider({ children }) {
  // choice is the persisted preference; theme is the effective value.
  const [choice, setChoiceState] = useState(readSavedChoice);
  const [osDark, setOsDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq?.addEventListener) return undefined;
    async function onChange(e) {
      setOsDark(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme = choice === "system" ? (osDark ? "dark" : "light") : choice;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // non-fatal; theme still applies for this session
    }
  }, [theme, choice]);

  const setTheme = useCallback((t) => {
    if (THEME_OPTIONS.includes(t)) setChoiceState(t);
  }, []);
  const toggle = useCallback(() => {
    setChoiceState((c) => (c === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, choice, setTheme, toggle }), [theme, choice, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
