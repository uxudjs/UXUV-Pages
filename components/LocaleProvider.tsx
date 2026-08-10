"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AppLocale = "zh-CN" | "zh-TW" | "en";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  activateAccount: (accountId: string, preferred?: unknown) => void;
  deactivateAccount: (accountId: string) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function browserLocale(language: string): AppLocale {
  const normalized = language.toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(normalized)) return "zh-TW";
  if (normalized.startsWith("zh")) return "zh-CN";
  return "en";
}

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "zh-CN" || value === "zh-TW" || value === "en";
}

const GLOBAL_LOCALE_KEY = "uxuv-locale";
const LOCALE_MIGRATION_KEY = "uxuv-locale-account-migration-v1";
const accountLocaleKey = (accountId: string) => `uxuv-locale:${encodeURIComponent(accountId)}`;

function storedLocale(key: string): AppLocale | null {
  try {
    const value = localStorage.getItem(key);
    return isAppLocale(value) ? value : null;
  } catch { return null; }
}

function accountLocale(accountId: string, preferred?: unknown): AppLocale {
  if (isAppLocale(preferred)) return preferred;
  const scoped = storedLocale(accountLocaleKey(accountId));
  if (scoped) return scoped;
  try {
    const owner = localStorage.getItem(LOCALE_MIGRATION_KEY);
    const legacy = storedLocale(GLOBAL_LOCALE_KEY);
    if (!owner && legacy) {
      localStorage.setItem(LOCALE_MIGRATION_KEY, accountId);
      localStorage.setItem(accountLocaleKey(accountId), legacy);
      return legacy;
    }
  } catch { /* Storage is optional. */ }
  return browserLocale(navigator.language);
}

export function LocaleProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<AppLocale>("zh-CN");
  const activeAccount = useRef<string | null>(null);

  useEffect(() => {
    const next = storedLocale(GLOBAL_LOCALE_KEY) ?? browserLocale(navigator.language);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLocaleState(next);
      document.documentElement.lang = next;
    });
    return () => { active = false; };
  }, []);

  const applyLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
  }, []);
  const activateAccount = useCallback((accountId: string, preferred?: unknown) => {
    activeAccount.current = accountId;
    const next = accountLocale(accountId, preferred);
    try { localStorage.setItem(accountLocaleKey(accountId), next); } catch { /* Storage is optional. */ }
    applyLocale(next);
  }, [applyLocale]);
  const deactivateAccount = useCallback((accountId: string) => {
    if (activeAccount.current !== accountId) return;
    activeAccount.current = null;
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (next) => {
      const accountId = activeAccount.current;
      try { localStorage.setItem(accountId ? accountLocaleKey(accountId) : GLOBAL_LOCALE_KEY, next); } catch { /* Storage is optional. */ }
      applyLocale(next);
      if (accountId) window.dispatchEvent(new CustomEvent("uxuv-account-locale-change", { detail: { accountId, value: next } }));
    },
    activateAccount,
    deactivateAccount,
  }), [activateAccount, applyLocale, deactivateAccount, locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
