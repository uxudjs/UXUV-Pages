"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  activateAccount: (accountId: string, preferred?: unknown) => void;
  deactivateAccount: (accountId: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

const GLOBAL_THEME_KEY = "uxuv-theme";
const THEME_MIGRATION_KEY = "uxuv-theme-account-migration-v1";
const accountThemeKey = (accountId: string) => `uxuv-theme:${encodeURIComponent(accountId)}`;

function storedTheme(key: string): ThemeChoice | null {
  try {
    const value = localStorage.getItem(key);
    return isThemeChoice(value) ? value : null;
  } catch { return null; }
}

function accountTheme(accountId: string, preferred?: unknown): ThemeChoice {
  if (isThemeChoice(preferred)) return preferred;
  const scoped = storedTheme(accountThemeKey(accountId));
  if (scoped) return scoped;
  try {
    const owner = localStorage.getItem(THEME_MIGRATION_KEY);
    const legacy = storedTheme(GLOBAL_THEME_KEY);
    if (!owner && legacy) {
      localStorage.setItem(THEME_MIGRATION_KEY, accountId);
      localStorage.setItem(accountThemeKey(accountId), legacy);
      return legacy;
    }
  } catch { /* Storage is optional. */ }
  return "system";
}

function applyTheme(theme: ThemeChoice) {
  const actual = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.dataset.theme = actual;
  document.documentElement.classList.toggle("dark", actual === "dark");
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const activeAccount = useRef<string | null>(null);

  useEffect(() => {
    const next = storedTheme(GLOBAL_THEME_KEY) ?? "system";
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setThemeState(next);
      applyTheme(next);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => { if (theme === "system") applyTheme(theme); };
    media.addEventListener("change", update);
    applyTheme(theme);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const activateAccount = useCallback((accountId: string, preferred?: unknown) => {
    activeAccount.current = accountId;
    const next = accountTheme(accountId, preferred);
    try { localStorage.setItem(accountThemeKey(accountId), next); } catch { /* Storage is optional. */ }
    setThemeState(next);
    applyTheme(next);
  }, []);

  const deactivateAccount = useCallback((accountId: string) => {
    if (activeAccount.current !== accountId) return;
    activeAccount.current = null;
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: (next) => {
      const accountId = activeAccount.current;
      try { localStorage.setItem(accountId ? accountThemeKey(accountId) : GLOBAL_THEME_KEY, next); } catch { /* Storage is optional. */ }
      applyTheme(next);
      setThemeState(next);
      if (accountId) window.dispatchEvent(new CustomEvent("uxuv-account-theme-change", { detail: { accountId, value: next } }));
    },
    activateAccount,
    deactivateAccount,
  }), [activateAccount, deactivateAccount, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
