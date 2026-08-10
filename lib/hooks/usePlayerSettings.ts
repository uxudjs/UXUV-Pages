"use client";

import { useEffect, useMemo } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import {
  legacyPlayerSettings, PLAYER_SETTINGS_MIGRATION_KEY, playerSettingsFromFields,
  type PlayerSettingsSnapshot,
} from "@/lib/player/player-settings";
import type { ConfigPayload } from "@/lib/sync/document-types";

export function usePlayerSettings(accountId: string, mode: "standard" | "premium" = "standard") {
  const runtime = useRuntimeConfig();
  const sync = useSync();
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const settings = useMemo(
    () => playerSettingsFromFields(fields, runtime.config.adKeywords, mode === "premium" ? "premium." : ""),
    [fields, mode, runtime.config.adKeywords],
  );

  useEffect(() => {
    if (mode === "premium" || sync.phase === "loading") return;
    try {
      if (localStorage.getItem(PLAYER_SETTINGS_MIGRATION_KEY)) return;
      localStorage.setItem(PLAYER_SETTINGS_MIGRATION_KEY, accountId);
      const legacy = localStorage.getItem("kvideo-settings");
      if (!legacy) return;
      const migrated = legacyPlayerSettings(JSON.parse(legacy));
      for (const [key, value] of Object.entries(migrated)) {
        if (!fields[key]) sync.updateConfigField(key, value);
      }
    } catch { /* Invalid legacy state stays untouched and inactive. */ }
  }, [accountId, fields, mode, sync]);

  const set = <K extends keyof PlayerSettingsSnapshot>(key: K, value: PlayerSettingsSnapshot[K]) => {
    sync.updateConfigField(mode === "premium" ? `premium.${key}` : key, value);
  };
  return { ...settings, set };
}
