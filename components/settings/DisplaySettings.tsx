"use client";

import { type FormEvent, useState } from "react";
import { useLocale, type AppLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Switch } from "@/components/ui/Switch";
import { useSync } from "@/components/SyncProvider";
import { useSearchDisplayModePreference, type SearchDisplayMode } from "@/lib/hooks/useSearchDisplayMode";
import { useSearchResultPreferences } from "@/lib/hooks/useSearchResultPreferences";
import { useAuth } from "@/lib/store/auth-store";
import type { ConfigPayload } from "@/lib/sync/document-types";

const COPY = {
  "zh-CN": {
    title: "显示设置", description: "管理搜索展示、滚动恢复、语言与主题。", remember: "记住滚动位置", rememberHint: "退出或刷新页面后，自动恢复到之前的滚动位置",
    latency: "实时延迟显示", latencyHint: "开启后，搜索结果中的延迟数值会每 5 秒更新一次", mode: "搜索结果显示方式", modeHint: "选择搜索结果的展示模式",
    normal: "默认显示", normalHint: "每个源的结果单独显示", grouped: "合并同名源", groupedHint: "相同名称的视频合并为一个卡片",
    language: "界面语言", simplified: "简体中文", traditional: "繁體中文", english: "English",
    theme: "主题", themeHint: "选择浅色、深色或跟随系统。", blocked: "内容类目过滤", blockedHint: "添加要从搜索结果中隐藏的类目关键词（如\"伦理\"），匹配的视频将不会显示",
    blockedPlaceholder: "输入类目关键词...", add: "添加", remove: "移除屏蔽类别",
  },
  "zh-TW": {
    title: "顯示設定", description: "管理搜尋顯示、捲動還原、語言與主題。", remember: "記住捲動位置", rememberHint: "離開或重新整理頁面後還原先前位置。",
    latency: "即時延遲顯示", latencyHint: "開啟後定期更新搜尋結果中的來源延遲。", mode: "搜尋結果顯示方式", modeHint: "選擇各來源分開顯示，或合併同名影片。",
    normal: "預設顯示", normalHint: "各來源的結果分開顯示", grouped: "合併同名來源", groupedHint: "相同名稱的影片合併為一張卡片",
    language: "介面語言", simplified: "简体中文", traditional: "繁體中文", english: "English",
    theme: "主題", themeHint: "選擇淺色、深色或跟隨系統。", blocked: "內容類目篩選", blockedHint: "隱藏類目名稱含有指定關鍵字的搜尋結果。",
    blockedPlaceholder: "輸入類目關鍵字…", add: "新增", remove: "移除封鎖類別",
  },
  en: {
    title: "Display settings", description: "Manage search presentation, scroll restoration, language, and theme.", remember: "Remember scroll position", rememberHint: "Restore your previous position after leaving or refreshing a page.",
    latency: "Live latency", latencyHint: "Periodically refresh source latency in search results.", mode: "Search result display", modeHint: "Show every source separately or group videos with the same title.",
    normal: "Default display", normalHint: "Show each source as a separate result", grouped: "Group matching titles", groupedHint: "Combine videos with the same title into one card",
    language: "Interface language", simplified: "简体中文", traditional: "繁體中文", english: "English",
    theme: "Theme", themeHint: "Choose light, dark, or the system theme.", blocked: "Blocked categories", blockedHint: "Hide search results whose category contains a keyword.",
    blockedPlaceholder: "Enter a category keyword…", add: "Add", remove: "Remove blocked category",
  },
} as const;

const localeOptions: Array<{ value: AppLocale; key: "simplified" | "traditional" | "english" }> = [
  { value: "zh-CN", key: "simplified" }, { value: "zh-TW", key: "traditional" }, { value: "en", key: "english" },
];

function Choice({ active, title, detail, onClick }: Readonly<{ active: boolean; title: string; detail: string; onClick: () => void }>) {
  return <button type="button" className="preference-choice" aria-pressed={active} data-focusable onClick={onClick}>
    <strong>{title}</strong><small>{detail}</small>
  </button>;
}

export function DisplaySettings({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const auth = useAuth();
  const sync = useSync();
  const { locale, setLocale } = useLocale();
  const copy = COPY[locale];
  const accountId = auth?.session.accountId ?? "anonymous";
  const search = useSearchResultPreferences(accountId, mode);
  const searchDisplayMode = useSearchDisplayModePreference(accountId, mode);
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const rememberField = mode === "premium" ? "premium.rememberScrollPosition" : "rememberScrollPosition";
  const rememberScrollPosition = fields[rememberField]?.value !== false;
  const [category, setCategory] = useState("");
  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    search.addBlockedCategory(category);
    setCategory("");
  };
  const chooseMode = (mode: SearchDisplayMode) => searchDisplayMode.setDisplayMode(mode);

  return <SettingsSection id="display" title={copy.title}>
    <div className="preference-stack">
      <div className="preference-toggle"><span><h3>{copy.remember}</h3><small>{copy.rememberHint}</small></span>
        <Switch checked={rememberScrollPosition} ariaLabel={copy.remember} onChange={(checked) => sync.updateConfigField(rememberField, checked)} /></div>
      <div className="preference-toggle"><span><h3>{copy.latency}</h3><small>{copy.latencyHint}</small></span>
        <Switch checked={search.realtimeLatency} ariaLabel={copy.latency} onChange={search.setRealtimeLatency} /></div>
      <div className="preference-group"><h3>{copy.mode}</h3><p>{copy.modeHint}</p><div className="preference-grid">
        <Choice active={searchDisplayMode.displayMode === "normal"} title={copy.normal} detail={copy.normalHint} onClick={() => chooseMode("normal")} />
        <Choice active={searchDisplayMode.displayMode === "grouped"} title={copy.grouped} detail={copy.groupedHint} onClick={() => chooseMode("grouped")} />
      </div></div>
      <div className="preference-group display-language-settings"><h3>{copy.language}</h3><div className="display-language-options" role="group" aria-label={copy.language}>
        {localeOptions.map((option) => <button key={option.value} type="button" aria-pressed={locale === option.value} data-focusable
          onClick={() => setLocale(option.value)}>{copy[option.key]}</button>)}
      </div></div>
      <div className="preference-group"><h3>{copy.blocked}</h3><p>{copy.blockedHint}</p>
        <form className="preference-block-form" onSubmit={addCategory}><input maxLength={40} value={category} placeholder={copy.blockedPlaceholder}
          onChange={(event) => setCategory(event.target.value)} /><button type="submit" data-focusable disabled={!category.trim()}>{copy.add}</button></form>
        {search.blockedCategories.length > 0 && <div className="preference-chips">{search.blockedCategories.map((value) => <button type="button" data-focusable
          aria-label={`${copy.remove} ${value}`} key={value} onClick={() => search.removeBlockedCategory(value)}>{value} ×</button>)}</div>}
      </div>
    </div>
  </SettingsSection>;
}
