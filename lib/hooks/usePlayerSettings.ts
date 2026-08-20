"use client";

import { useEffect, useMemo } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import {
  legacyPlayerSettings, PLAYER_SETTINGS_MIGRATION_KEY, playerSettingsFromFields,
  type PlayerSettingsSnapshot,
} from "@/lib/player/player-settings";
import { deleteVideoSkipRule, normalizeVideoSkipRules, upsertVideoSkipRule, type VideoSkipRuleInput } from "@/lib/player/auto-skip";
import type { ConfigPayload } from "@/lib/sync/document-types";

export function usePlayerSettings(accountId: string, mode: "standard" | "premium" = "standard") {
  const runtime = useRuntimeConfig();
  const sync = useSync();
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const settings = useMemo(
    () => playerSettingsFromFields(fields, runtime.config.adKeywords, mode === "premium" ? "premium." : ""),
    [fields, mode, runtime.config.adKeywords],
  );
  const videoSkipRules = useMemo(() => normalizeVideoSkipRules(fields.videoSkipRules?.value), [fields.videoSkipRules?.value]);

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
  const setVideoSkipRule = (key: string, value: VideoSkipRuleInput) => {
    sync.updateConfigField("videoSkipRules", upsertVideoSkipRule(videoSkipRules, key, value));
  };
  const removeVideoSkipRule = (key: string) => {
    sync.updateConfigField("videoSkipRules", deleteVideoSkipRule(videoSkipRules, key));
  };
  return { ...settings, videoSkipRules, setVideoSkipRule, deleteVideoSkipRule: removeVideoSkipRule, set };
}
