"use client";

import { useEffect } from "react";
import { isAppLocale, useLocale, type AppLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { isThemeChoice, useTheme, type ThemeChoice } from "@/components/ThemeProvider";
import type { ConfigPayload } from "@/lib/sync/document-types";

type PreferenceEvent<T> = CustomEvent<{ accountId: string; value: T }>;

export function AccountPreferenceBridge({ accountId }: Readonly<{ accountId: string }>) {
  const sync = useSync();
  const { activateAccount: activateTheme, deactivateAccount: deactivateTheme } = useTheme();
  const { activateAccount: activateLocale, deactivateAccount: deactivateLocale } = useLocale();
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const syncedTheme = fields.theme?.value;
  const syncedLocale = fields.locale?.value;

  useEffect(() => {
    activateTheme(accountId);
    activateLocale(accountId);
    return () => {
      deactivateTheme(accountId);
      deactivateLocale(accountId);
    };
  }, [accountId, activateLocale, activateTheme, deactivateLocale, deactivateTheme]);

  useEffect(() => {
    if (isThemeChoice(syncedTheme)) activateTheme(accountId, syncedTheme);
  }, [accountId, activateTheme, syncedTheme]);
  useEffect(() => {
    if (isAppLocale(syncedLocale)) activateLocale(accountId, syncedLocale);
  }, [accountId, activateLocale, syncedLocale]);

  useEffect(() => {
    const themeChange = (event: Event) => {
      const detail = (event as PreferenceEvent<ThemeChoice>).detail;
      if (detail.accountId === accountId) sync.updateConfigField("theme", detail.value);
    };
    const localeChange = (event: Event) => {
      const detail = (event as PreferenceEvent<AppLocale>).detail;
      if (detail.accountId === accountId) sync.updateConfigField("locale", detail.value);
    };
    window.addEventListener("uxuv-account-theme-change", themeChange);
    window.addEventListener("uxuv-account-locale-change", localeChange);
    return () => {
      window.removeEventListener("uxuv-account-theme-change", themeChange);
      window.removeEventListener("uxuv-account-locale-change", localeChange);
    };
  }, [accountId, sync]);
  return null;
}
