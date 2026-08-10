"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Icon } from "@/components/ui/Icon";

type UpdateStatus = "loading" | "update-available" | "up-to-date" | "ahead-of-remote" | "check-failed";
interface ReleaseEntry { version: string; title?: string; publishedAt?: string; notes?: string[] }
interface UpdateResult {
  status: UpdateStatus;
  currentVersion?: string;
  latestVersion?: string;
  checkedAt?: string;
  currentRelease?: ReleaseEntry | null;
  latestRelease?: ReleaseEntry | null;
  source?: { repository?: string; branch?: string; changelogUrl?: string; repositoryUrl?: string };
}

const COPY = {
  "zh-CN": { title: "版本与更新", description: "查看当前版本、最近更新内容，并手动检查 GitHub 上是否已有新版本。", refresh: "检查更新", current: "当前版本", loadingVersion: "加载中…", loadingRelease: "正在读取本地版本说明", updated: "已是最新版本", available: "发现新版本", ahead: "本地版本较新", failed: "检查失败", checking: "正在获取最新版本信息。", checked: "上次检查", source: "检查来源", changelog: "查看更新日志", repository: "查看仓库", notes: "当前版本更新内容", noNotes: "当前版本尚未记录更新内容。", pinned: "固定参考版本" },
  "zh-TW": { title: "版本與更新", description: "查看目前版本、最近更新內容，並手動檢查 GitHub 上是否已有新版本。", refresh: "檢查更新", current: "目前版本", loadingVersion: "載入中…", loadingRelease: "正在讀取本機版本說明", updated: "已是最新版本", available: "發現新版本", ahead: "本機版本較新", failed: "檢查失敗", checking: "正在取得最新版本資訊。", checked: "上次檢查", source: "檢查來源", changelog: "查看更新記錄", repository: "查看儲存庫", notes: "目前版本更新內容", noNotes: "目前版本尚未記錄更新內容。", pinned: "固定參考版本" },
  en: { title: "Version and updates", description: "Review the current version and recent changes, or check GitHub for a newer release.", refresh: "Check for updates", current: "Current version", loadingVersion: "Loading…", loadingRelease: "Reading local release notes", updated: "Up to date", available: "Update available", ahead: "Local version is newer", failed: "Update check failed", checking: "Fetching the latest version information.", checked: "Last checked", source: "Source", changelog: "View changelog", repository: "View repository", notes: "Current release notes", noNotes: "No release notes are recorded for this version.", pinned: "Pinned reference release" },
} as const;

function safeHttps(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

function release(value: unknown): ReleaseEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<ReleaseEntry>;
  if (typeof entry.version !== "string") return null;
  return { version: entry.version, ...(typeof entry.title === "string" ? { title: entry.title } : {}),
    ...(typeof entry.publishedAt === "string" ? { publishedAt: entry.publishedAt } : {}),
    ...(Array.isArray(entry.notes) ? { notes: entry.notes.filter((note): note is string => typeof note === "string").slice(0, 20) } : {}) };
}

function formatCheckedAt(value: string | undefined, locale: "zh-CN" | "zh-TW" | "en"): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

async function loadUpdate(signal?: AbortSignal): Promise<UpdateResult> {
  const response = await fetch("/api/app-update", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
  const value = await response.json() as Record<string, unknown>;
  const statuses: UpdateStatus[] = ["update-available", "up-to-date", "ahead-of-remote", "check-failed"];
  if (!response.ok || !statuses.includes(value.status as UpdateStatus)) throw new Error("invalid-update-response");
  const rawSource = value.source && typeof value.source === "object" ? value.source as Record<string, unknown> : {};
  return {
    status: value.status as UpdateStatus,
    ...(typeof value.currentVersion === "string" ? { currentVersion: value.currentVersion } : {}),
    ...(typeof value.latestVersion === "string" ? { latestVersion: value.latestVersion } : {}),
    ...(typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}),
    currentRelease: release(value.currentRelease),
    latestRelease: release(value.latestRelease),
    source: {
      ...(typeof rawSource.repository === "string" ? { repository: rawSource.repository } : {}),
      ...(typeof rawSource.branch === "string" ? { branch: rawSource.branch } : {}),
      ...(safeHttps(rawSource.changelogUrl) ? { changelogUrl: safeHttps(rawSource.changelogUrl) } : {}),
      ...(safeHttps(rawSource.repositoryUrl) ? { repositoryUrl: safeHttps(rawSource.repositoryUrl) } : {}),
    },
  };
}

export function AppVersionSettings() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<UpdateResult>({ status: "loading" });
  const refresh = () => {
    setResult((current) => ({ ...current, status: "loading" }));
    void loadUpdate().then(setResult).catch(() => setResult((current) => ({ ...current, status: "check-failed" })));
  };
  useEffect(() => {
    const controller = new AbortController();
    void loadUpdate(controller.signal).then(setResult).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ status: "check-failed" });
    });
    return () => controller.abort();
  }, []);

  const statusLabel = result.status === "update-available" ? copy.available : result.status === "ahead-of-remote" ? copy.ahead
    : result.status === "check-failed" ? copy.failed : copy.updated;
  const statusDescription = result.status === "loading" ? copy.checking : result.status === "up-to-date"
    ? locale === "zh-CN" ? `当前实例版本 ${result.currentVersion ?? "—"} 与 GitHub 最新版本一致。`
      : locale === "zh-TW" ? `目前執行個體版本 ${result.currentVersion ?? "—"} 與 GitHub 最新版本一致。`
        : `Version ${result.currentVersion ?? "—"} matches the latest GitHub release.`
    : `${result.currentVersion ?? "—"} / ${result.latestVersion ?? "—"}`;
  const currentRelease = result.currentRelease;
  const sourceName = `${result.source?.repository ?? "KuekHaoYang/KVideo"} · ${result.source?.branch ?? "main"}`;

  return <SettingsSection id="app-version" title={copy.title} description={copy.description} summary={
    <button className="version-refresh" type="button" data-focusable disabled={result.status === "loading"} onClick={refresh}><Icon source={RefreshCw} size={14} />{copy.refresh}</button>
  }>
    <div className="version-settings" data-update-status={result.status} aria-live="polite">
      <div className="version-overview"><div className="version-current"><small>{copy.current}</small><strong>{result.currentVersion ?? copy.loadingVersion}</strong>
        <span>{currentRelease ? [currentRelease.title, currentRelease.publishedAt].filter(Boolean).join(" · ") : copy.loadingRelease}</span></div>
        <div className="version-status"><b>{statusLabel}</b><p>{statusDescription}</p><small>{copy.checked}：{formatCheckedAt(result.checkedAt, locale) ?? copy.checking}</small></div></div>
      <div className="version-source"><span>{copy.source}：{sourceName}</span>
        {result.source?.changelogUrl && <a href={result.source.changelogUrl} target="_blank" rel="noreferrer">{copy.changelog}<Icon source={ExternalLink} size={12} /></a>}
        {result.source?.repositoryUrl && <a href={result.source.repositoryUrl} target="_blank" rel="noreferrer">{copy.repository}<Icon source={ExternalLink} size={12} /></a>}</div>
      <div className="version-notes"><h3>{copy.notes}</h3>{currentRelease ? <><small>{[currentRelease.version, currentRelease.title, currentRelease.publishedAt].filter(Boolean).join(" · ")}</small>
        <ul>{(currentRelease.notes?.length ? currentRelease.notes : [copy.pinned]).map((note) => <li key={note}>{note}</li>)}</ul></> : <p>{copy.noNotes}</p>}</div>
    </div>
  </SettingsSection>;
}
