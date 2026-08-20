"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";

const COPY = {
  "zh-CN": { back: "返回上一页", title: "设置", description: "管理应用程序配置", navigation: "设置分类", domains: { account: "账户与权限", sources: "视频源与弹幕", playback: "播放与网络", display: "显示、搜索与语言", sync: "同步与用量", data: "数据管理" } },
  "zh-TW": { back: "返回上一頁", title: "設定", description: "管理應用程式設定", navigation: "設定分類", domains: { account: "帳戶與權限", sources: "影片來源與彈幕", playback: "播放與網路", display: "顯示、搜尋與語言", sync: "同步與用量", data: "資料管理" } },
  en: { back: "Back", title: "Settings", description: "Manage application settings", navigation: "Settings sections", domains: { account: "Account and access", sources: "Sources and danmaku", playback: "Playback and network", display: "Display, search, and language", sync: "Sync and usage", data: "Data management" } },
} as const;

export function SettingsAnchorNav({ className = "settings-anchor-nav" }: Readonly<{ className?: string }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  return <nav className={className} aria-label={copy.navigation}>
    <a href="#settings-domain-account" data-focusable>{copy.domains.account}</a>
    <a href="#settings-domain-sources" data-focusable>{copy.domains.sources}</a>
    <a href="#settings-domain-playback" data-focusable>{copy.domains.playback}</a>
    <a href="#settings-domain-display" data-focusable>{copy.domains.display}</a>
    <a href="#settings-domain-sync" data-focusable>{copy.domains.sync}</a>
    <a href="#settings-domain-data" data-focusable>{copy.domains.data}</a>
  </nav>;
}

export function SettingsPageHeading() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = COPY[locale];
  return <header className="page-heading settings-page-heading">
    <button className="settings-back" type="button" data-focusable onClick={() => router.back()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>{copy.back}
    </button>
    <div className="settings-title-row"><span className="settings-title-icon" aria-hidden="true"><svg viewBox="0 -960 960 960"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z" /></svg></span>
      <div><h1>{copy.title}</h1><p>{copy.description}</p></div>
    </div>
  </header>;
}
