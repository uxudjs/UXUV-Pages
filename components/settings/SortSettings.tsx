"use client";

import { useLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useSearchResultPreferences } from "@/lib/hooks/useSearchResultPreferences";
import { useAuth } from "@/lib/store/auth-store";
import { SEARCH_SORT_OPTIONS, type SearchSortOption } from "@/lib/utils/search-result-policy";

const COPY = {
  "zh-CN": { title: "搜索结果排序", description: "选择搜索结果的默认排序方式", options: {
    default: "默认排序", relevance: "按相关性", "latency-asc": "延迟低到高", "date-desc": "发布时间（新到旧）",
    "date-asc": "发布时间（旧到新）", "rating-desc": "按评分（高到低）", "name-asc": "按名称（A-Z）", "name-desc": "按名称（Z-A）" } },
  "zh-TW": { title: "搜尋結果排序", description: "選擇搜尋結果的預設排序方式。", options: {
    default: "預設排序", relevance: "依相關性", "latency-asc": "延遲低到高", "date-desc": "發布時間（新到舊）",
    "date-asc": "發布時間（舊到新）", "rating-desc": "依評分（高到低）", "name-asc": "依名稱（A-Z）", "name-desc": "依名稱（Z-A）" } },
  en: { title: "Search result sorting", description: "Choose the default order for search results.", options: {
    default: "Default", relevance: "Relevance", "latency-asc": "Lowest latency", "date-desc": "Release date (newest)",
    "date-asc": "Release date (oldest)", "rating-desc": "Highest rating", "name-asc": "Name (A-Z)", "name-desc": "Name (Z-A)" } },
} as const satisfies Record<string, { title: string; description: string; options: Record<SearchSortOption, string> }>;

export function SortSettings({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const preferences = useSearchResultPreferences(auth?.session.accountId ?? "anonymous", mode);
  return <SettingsSection id="sort" title={copy.title} description={copy.description}>
    <div className="preference-grid sort-preference-grid">{SEARCH_SORT_OPTIONS.map((option) => <button type="button" data-focusable
      className="preference-choice" aria-pressed={preferences.sortBy === option} key={option}
      onClick={() => preferences.setSortBy(option)}>{copy.options[option]}</button>)}</div>
  </SettingsSection>;
}
