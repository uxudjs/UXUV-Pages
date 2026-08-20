"use client";

import { useCallback, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { ExportModal } from "@/components/settings/ExportModal";
import { SettingsImportModal } from "@/components/settings/SettingsImportModal";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import { homeTagsStorageKey } from "@/components/home/hooks/useTagManager";
import { buildAllSettingsExport, prepareImportedPayloads, serializeSettingsExport, type SettingsImportPreview, type StandardPreferences } from "@/lib/data/settings-transfer";
import { searchDisplayModeKey } from "@/lib/hooks/useSearchDisplayMode";
import { searchHistoryStorageKey } from "@/lib/hooks/useSearchHistory";
import { searchResultPreferencesStorageKey } from "@/lib/hooks/useSearchResultPreferences";
import { useAuth } from "@/lib/store/auth-store";
import type { ConfigPayload, LibraryPayload } from "@/lib/sync/document-types";
import { SEARCH_SORT_OPTIONS, type SearchSortOption } from "@/lib/utils/search-result-policy";

const COPY = {
  "zh-CN": { title: "数据管理", description: "导出或导入当前账户的普通与 Premium 模式数据。", export: "导出数据", exportHint: "生成经过敏感信息检查的双模式 JSON 备份。", import: "导入数据", importHint: "先完整验证和预览，再一次性替换本地同步数据。", restricted: "此账户没有数据管理权限。", saved: "导入成功；更改已在本机保存并等待同步。" },
  "zh-TW": { title: "資料管理", description: "匯出或匯入目前帳戶的一般與 Premium 模式資料。", export: "匯出資料", exportHint: "產生經過敏感資訊檢查的雙模式 JSON 備份。", import: "匯入資料", importHint: "先完整驗證和預覽，再一次替換本機同步資料。", restricted: "此帳戶沒有資料管理權限。", saved: "匯入成功；變更已儲存在本機並等待同步。" },
  en: { title: "Data management", description: "Export or import this account's standard and Premium data.", export: "Export settings", exportHint: "Create a two-mode JSON backup after a sensitive-data check.", import: "Import settings", importHint: "Validate and preview everything before replacing local sync data atomically.", clear: "Clear all data", clearTitle: "Clear all data?", clearMessage: "This removes this account's settings, history, favorites, and local cache. This cannot be undone.", cancel: "Cancel", confirm: "Clear", restricted: "This account cannot manage data.", saved: "Import succeeded; changes are saved locally and waiting to sync." },
} as const;

const CLEAR_COPY = {
  "zh-CN": { export: "导出设置", import: "导入设置", clear: "清除所有数据", title: "清除所有数据？", message: "这会删除当前账户的设置、历史、收藏和本地缓存，且无法撤销。", cancel: "取消", confirm: "清除" },
  "zh-TW": { export: "匯出設定", import: "匯入設定", clear: "清除所有資料", title: "清除所有資料？", message: "這會刪除目前帳戶的設定、歷史、收藏與本機快取，且無法復原。", cancel: "取消", confirm: "清除" },
  en: { export: "Export settings", import: "Import settings", clear: "Clear all data", title: "Clear all data?", message: "This removes this account's settings, history, favorites, and local cache. This cannot be undone.", cancel: "Cancel", confirm: "Clear" },
} as const;

function parsed(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}

function preferencesFor(accountId: string, mode: "standard" | "premium"): StandardPreferences {
  const display = localStorage.getItem(searchDisplayModeKey(accountId, mode));
  const rawPolicy = parsed(searchResultPreferencesStorageKey(accountId, mode));
  const policy = rawPolicy && typeof rawPolicy === "object" && !Array.isArray(rawPolicy) ? rawPolicy as Record<string, unknown> : {};
  const blockedCategories = Array.isArray(policy.blockedCategories)
    ? policy.blockedCategories.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
  const sortBy = SEARCH_SORT_OPTIONS.includes(policy.sortBy as SearchSortOption) ? policy.sortBy as SearchSortOption : "default";
  const rawHistory = parsed(searchHistoryStorageKey(accountId, mode));
  const searchHistory = Array.isArray(rawHistory) ? rawHistory.flatMap((item): NonNullable<StandardPreferences["searchHistory"]> => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 200 || !Number.isSafeInteger(value.timestamp) || (value.timestamp as number) < 0) return [];
    return [{ query: value.query.trim(), timestamp: value.timestamp as number,
      ...(typeof value.resultCount === "number" && Number.isSafeInteger(value.resultCount) && value.resultCount >= 0 ? { resultCount: value.resultCount } : {}) }];
  }).slice(0, 20) : [];
  const readTags = (type: "movie" | "tv") => {
    const value = parsed(homeTagsStorageKey(accountId, mode, type));
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 30) : [];
  };
  return {
    ...(display === "normal" || display === "grouped" ? { searchDisplayMode: display } : {}),
    searchPolicy: { sortBy, realtimeLatency: policy.realtimeLatency === true, blockedCategories },
    searchHistory,
    homeTags: { movie: readTags("movie"), tv: readTags("tv") },
  };
}

export function DataSettings() {
  const auth = useAuth()!;
  const sync = useSync();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const clearCopy = CLEAR_COPY[locale];
  const [modal, setModal] = useState<"export" | "import" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saved, setSaved] = useState(false);
  const accountId = auth.session.accountId;
  const permissions = new Set(auth.session.customPermissions);
  const canManage = auth.session.role === "admin" || auth.session.role === "super_admin" || permissions.has("data_management");
  const config = sync.documents.config.payload as ConfigPayload;
  const library = sync.documents.library.payload as LibraryPayload;

  const buildExport = useCallback((options: { includeSearchHistory: boolean; includeWatchHistory: boolean }) => serializeSettingsExport(buildAllSettingsExport({
    config, library, preferences: { standard: preferencesFor(accountId, "standard"), premium: preferencesFor(accountId, "premium") }, ...options,
  })), [accountId, config, library]);

  const applyImport = (preview: SettingsImportPreview) => {
    const changes: Array<{ key: string; value: string }> = [];
    const addPreferences = (prefs: StandardPreferences, mode: "standard" | "premium") => {
      if (prefs.searchDisplayMode) changes.push({ key: searchDisplayModeKey(accountId, mode), value: prefs.searchDisplayMode });
      if (prefs.searchPolicy) changes.push({ key: searchResultPreferencesStorageKey(accountId, mode), value: JSON.stringify(prefs.searchPolicy) });
      if (preview.envelope.included.searchHistory) changes.push({ key: searchHistoryStorageKey(accountId, mode), value: JSON.stringify(prefs.searchHistory ?? []) });
      if (prefs.homeTags?.movie) changes.push({ key: homeTagsStorageKey(accountId, mode, "movie"), value: JSON.stringify(prefs.homeTags.movie) });
      if (prefs.homeTags?.tv) changes.push({ key: homeTagsStorageKey(accountId, mode, "tv"), value: JSON.stringify(prefs.homeTags.tv) });
    };
    if (preview.envelope.mode === "all") {
      addPreferences(preview.envelope.preferences.standard, "standard");
      addPreferences(preview.envelope.preferences.premium, "premium");
    } else addPreferences(preview.envelope.preferences, "standard");
    const previous = changes.map(({ key }) => ({ key, value: localStorage.getItem(key) }));
    try {
      changes.forEach(({ key, value }) => localStorage.setItem(key, value));
      sync.replacePayload(prepareImportedPayloads(preview, { config, library }));
    } catch (error) {
      previous.forEach(({ key, value }) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); });
      throw error;
    }
    window.dispatchEvent(new Event("uxuv-search-display-mode-change"));
    window.dispatchEvent(new Event("uxuv-search-policy-change"));
    setSaved(true);
  };

  const clearAll = () => {
    for (const mode of ["standard", "premium"] as const) {
      localStorage.removeItem(searchDisplayModeKey(accountId, mode));
      localStorage.removeItem(searchResultPreferencesStorageKey(accountId, mode));
      localStorage.removeItem(searchHistoryStorageKey(accountId, mode));
      localStorage.removeItem(homeTagsStorageKey(accountId, mode, "movie"));
      localStorage.removeItem(homeTagsStorageKey(accountId, mode, "tv"));
    }
    sync.replacePayload({ config: { fields: {}, sources: [], subscriptions: [], tombstones: [] }, library: { history: [], favorites: [], tombstones: [] } });
    setConfirmClear(false);
  };

  return <SettingsSection id="data" title={copy.title}>
    {!canManage && <p className="settings-restriction" role="note">{copy.restricted}</p>}
    <div className="data-settings-actions">
      <button type="button" data-focusable disabled={!canManage} onClick={() => { setSaved(false); setModal("export"); }}><span>{clearCopy.export}</span><Icon source={Download} size={20} /></button>
      <button type="button" data-focusable disabled={!canManage} onClick={() => { setSaved(false); setModal("import"); }}><span>{clearCopy.import}</span><Icon source={Upload} size={20} /></button>
    </div>
    <section className="data-settings-danger-zone" aria-labelledby="data-danger-title">
      <div><h3 id="data-danger-title">{clearCopy.clear}</h3><p>{clearCopy.message}</p></div>
      <button className="danger-button" type="button" data-focusable disabled={!canManage} onClick={() => setConfirmClear(true)}><span>{clearCopy.clear}</span><Icon source={Trash2} size={20} /></button>
    </section>
    {saved && <p className="import-status" role="status">{copy.saved}</p>}
    {modal === "export" && <ExportModal onClose={() => setModal(null)} onBuild={buildExport} />}
    {modal === "import" && <SettingsImportModal onClose={() => setModal(null)} onImport={applyImport} />}
    {confirmClear && <section className="source-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="clear-data-title">
      <h3 id="clear-data-title">{clearCopy.title}</h3><p>{clearCopy.message}</p><div><button type="button" onClick={() => setConfirmClear(false)}>{clearCopy.cancel}</button>
        <button className="danger-button" type="button" onClick={clearAll}>{clearCopy.confirm}</button></div></section>}
  </SettingsSection>;
}
