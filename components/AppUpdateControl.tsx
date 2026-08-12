"use client";

import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";
import { useAuth } from "@/lib/store/auth-store";

type UpdateStatus = "loading" | "update-available" | "up-to-date" | "ahead-of-remote" | "check-failed";
type CopyStatus = "idle" | "copying" | "copied" | "copy-failed";

interface UpdateResult {
  status: UpdateStatus;
  currentVersion?: string;
  latestVersion?: string;
  checkedAt?: string;
  source?: { changelogUrl?: string; repositoryUrl?: string };
  copy?: { available: boolean; href: string; version: string };
}

const COPY = {
  "zh-CN": {
    title: "版本与更新", open: "查看版本与更新", current: "当前版本", latest: "最新版本", loading: "正在检查更新",
    available: "发现新版本", updated: "已是最新版本", ahead: "本地版本较新", failed: "检查更新失败", refresh: "重新检查",
    copy: "复制最新 _worker.js", copying: "正在复制…", copied: "最新 _worker.js 已复制", copyFailed: "复制失败，请重新检查", close: "关闭",
    checked: "检查时间", changelog: "更新日志", repository: "代码仓库",
  },
  "zh-TW": {
    title: "版本與更新", open: "查看版本與更新", current: "目前版本", latest: "最新版本", loading: "正在檢查更新",
    available: "發現新版本", updated: "已是最新版本", ahead: "本機版本較新", failed: "檢查更新失敗", refresh: "重新檢查",
    copy: "複製最新 _worker.js", copying: "正在複製…", copied: "最新 _worker.js 已複製", copyFailed: "複製失敗，請重新檢查", close: "關閉",
    checked: "檢查時間", changelog: "更新日誌", repository: "程式碼倉庫",
  },
  en: {
    title: "Version and updates", open: "View version and updates", current: "Current version", latest: "Latest version", loading: "Checking for updates",
    available: "Update available", updated: "Up to date", ahead: "Local version is newer", failed: "Update check failed", refresh: "Check again",
    copy: "Copy latest _worker.js", copying: "Copying…", copied: "Latest _worker.js copied", copyFailed: "Copy failed. Check again before retrying.", close: "Close",
    checked: "Checked", changelog: "Changelog", repository: "Repository",
  },
} as const;

export function clearAppUpdateCache(accountId: string): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`uxuv-app-update:v1:${accountId}`);
}

function cachedUpdate(accountId: string): UpdateResult | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`uxuv-app-update:v1:${accountId}`) ?? "null") as UpdateResult | null;
    const statuses: UpdateStatus[] = ["update-available", "up-to-date", "ahead-of-remote", "check-failed"];
    return value && statuses.includes(value.status) ? value : null;
  } catch {
    return null;
  }
}

function cacheUpdate(accountId: string, value: UpdateResult): void {
  sessionStorage.setItem(`uxuv-app-update:v1:${accountId}`, JSON.stringify(value));
}

function safeHttps(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

async function loadUpdate(signal?: AbortSignal): Promise<UpdateResult> {
  const response = await fetch("/api/app-update", {
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal,
  });
  const value = await response.json() as Record<string, unknown>;
  const statuses: UpdateStatus[] = ["update-available", "up-to-date", "ahead-of-remote", "check-failed"];
  if (!response.ok || !statuses.includes(value.status as UpdateStatus)) throw new Error("invalid-update-response");
  const descriptor = value.copy && typeof value.copy === "object" ? value.copy as Record<string, unknown> : null;
  const rawSource = value.source && typeof value.source === "object" ? value.source as Record<string, unknown> : null;
  const copy = descriptor && typeof descriptor.available === "boolean" && descriptor.href === "/api/app-update?artifact=worker"
    && typeof descriptor.version === "string"
    ? { available: descriptor.available, href: descriptor.href, version: descriptor.version } : undefined;
  return {
    status: value.status as UpdateStatus,
    ...(typeof value.currentVersion === "string" ? { currentVersion: value.currentVersion } : {}),
    ...(typeof value.latestVersion === "string" ? { latestVersion: value.latestVersion } : {}),
    ...(typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}),
    ...(rawSource ? { source: {
      ...(safeHttps(rawSource.changelogUrl) ? { changelogUrl: safeHttps(rawSource.changelogUrl) } : {}),
      ...(safeHttps(rawSource.repositoryUrl) ? { repositoryUrl: safeHttps(rawSource.repositoryUrl) } : {}),
    } } : {}),
    ...(copy ? { copy } : {}),
  };
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    let copied = false;
    try {
      field.select();
      copied = document.execCommand("copy");
    } finally {
      field.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
    if (!copied) throw new Error("clipboard-unavailable");
  }
}

export function AppUpdateControl() {
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<UpdateResult>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const close = () => { setOpen(false); setCopyStatus("idle"); };
  useDialogFocusTrap({ open, dialogRef, returnFocusRef: triggerRef, onEscape: close });

  const refresh = (signal?: AbortSignal) => {
    setResult({ status: "loading" });
    setCopyStatus("idle");
    return loadUpdate(signal).then((value) => { cacheUpdate(auth!.session.accountId, value); setResult(value); }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setResult({ status: "check-failed" });
      }
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    const accountId = auth!.session.accountId;
    const cached = cachedUpdate(accountId);
    if (cached) {
      void Promise.resolve(cached).then(setResult);
      return () => controller.abort();
    }
    void loadUpdate(controller.signal).then((value) => { cacheUpdate(accountId, value); setResult(value); }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ status: "check-failed" });
    });
    return () => controller.abort();
  }, [auth]);

  const statusLabel = result.status === "loading" ? copy.loading : result.status === "update-available" ? copy.available
    : result.status === "ahead-of-remote" ? copy.ahead : result.status === "check-failed" ? copy.failed : copy.updated;
  const canCopy = result.copy?.available === true && (result.status === "update-available" || result.status === "up-to-date");
  const checkedAt = result.checkedAt && !Number.isNaN(Date.parse(result.checkedAt))
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.checkedAt)) : null;
  const copyWorker = async () => {
    if (!canCopy || !result.copy || copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      const response = await fetch("/api/app-update?artifact=worker", { credentials: "same-origin", cache: "no-store" });
      const version = response.headers.get("X-UXUVideo-Worker-Version");
      if (!response.ok || version !== result.latestVersion || version !== result.copy.version) throw new Error("unverified-worker");
      await writeClipboard(await response.text());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("copy-failed");
      setResult((current) => ({ status: "check-failed", currentVersion: current.currentVersion, latestVersion: current.latestVersion }));
    }
  };

  return <>
    <button ref={triggerRef} className="app-update-trigger" data-update-status={result.status} type="button" data-focusable
      aria-label={copy.open} onClick={() => setOpen(true)}>
      <span aria-hidden="true" />
      <span>{result.status === "update-available" ? copy.available : result.currentVersion ?? statusLabel}</span>
    </button>
    {open && <>
      <button className="app-update-backdrop" type="button" aria-label={copy.close} onClick={close} />
      <section ref={dialogRef} className="app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <header><div><small>{statusLabel}</small><h2 id="app-update-title">{copy.title}</h2></div>
          <button type="button" className="app-update-close" aria-label={copy.close} data-focusable onClick={close}><Icon source={X} size={18} /></button></header>
        <dl><div><dt>{copy.current}</dt><dd>{result.currentVersion ?? "—"}</dd></div>
          <div><dt>{copy.latest}</dt><dd>{result.latestVersion ?? "—"}</dd></div></dl>
        <div className="app-update-meta">
          {checkedAt && <time dateTime={result.checkedAt}>{copy.checked}：{checkedAt}</time>}
          {result.source?.changelogUrl && <a href={result.source.changelogUrl} target="_blank" rel="noreferrer">{copy.changelog}<Icon source={ExternalLink} size={13} /></a>}
          {result.source?.repositoryUrl && <a href={result.source.repositoryUrl} target="_blank" rel="noreferrer">{copy.repository}<Icon source={ExternalLink} size={13} /></a>}
        </div>
        <div className="app-update-actions">
          <button type="button" data-focusable disabled={result.status === "loading"} onClick={() => void refresh()}><Icon source={RefreshCw} size={16} />{copy.refresh}</button>
          <button type="button" className="primary-button" data-focusable disabled={!canCopy} aria-disabled={copyStatus === "copying"}
            onClick={() => void copyWorker()}><Icon source={Download} size={16} />{copyStatus === "copying" ? copy.copying : copy.copy}</button>
        </div>
        <p className="app-update-feedback" aria-live="polite">
          {copyStatus === "copied" ? copy.copied : copyStatus === "copy-failed" ? copy.copyFailed : ""}
        </p>
      </section>
    </>}
  </>;
}
