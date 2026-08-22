"use client";

import { useEffect, useState } from "react";
import { useLocale, type AppLocale } from "@/components/LocaleProvider";
import { useUsageAlert } from "@/components/UsageAlertProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import type { ConfiguredUsage, UsageLevel } from "@/lib/hooks/useCloudflareUsage";

const number = new Intl.NumberFormat("en-US");

interface UsageCopy {
  title: string;
  description: string;
  refresh: string;
  loading: string;
  error: string;
  unconfiguredTitle: string;
  unconfiguredDescription: string;
  missing: string;
  summary: string;
  reset: string;
  calculating: string;
  unknown: string;
  stale: string;
  observed: string;
  observedNote: string;
  workerAccount: string;
  d1AccountRead: string;
  d1AccountWrite: string;
  d1AccountStorage: string;
  levels: Record<UsageLevel, string>;
  duration: (days: number, hours: number, minutes: number) => string;
  workersErrorDetail: (value: string) => string;
}

const COPY: Record<AppLocale, UsageCopy> = {
  "zh-CN": {
    title: "Cloudflare 用量",
    description: "只读展示 Cloudflare 账户总量；Analytics Token 仅保留在 Worker。",
    refresh: "刷新用量", loading: "正在读取 Cloudflare 用量…", error: "无法读取 Cloudflare 用量，请稍后重试。",
    unconfiguredTitle: "尚未配置 Cloudflare 用量分析",
    unconfiguredDescription: "业务功能不受影响。请在 Worker 中配置只读 Analytics Token 与 Account ID。",
    missing: "缺少", summary: "总体状态", reset: "UTC 重置倒计时", calculating: "计算中…", unknown: "未知",
    stale: "数据可能已陈旧；当前显示最近一小时内的安全快照。", observed: "观测时间",
    observedNote: "Analytics 指标可能延迟，请以 Cloudflare Dashboard 和实际配额错误为准。",
    workerAccount: "Workers 账户请求", d1AccountRead: "D1 账户读取", d1AccountWrite: "D1 账户写入", d1AccountStorage: "D1 账户存储",
    levels: { normal: "正常", notice: "提示", warning: "警告", critical: "严重", exhausted: "已耗尽" },
    duration: (days, hours, minutes) => `${days > 0 ? `${days} 天 ` : ""}${hours} 小时 ${minutes} 分`,
    workersErrorDetail: (value) => `账户错误 ${value} 次`,
  },
  "zh-TW": {
    title: "Cloudflare 用量",
    description: "唯讀顯示 Cloudflare 帳戶總量；Analytics Token 僅保留在 Worker。",
    refresh: "重新整理用量", loading: "正在讀取 Cloudflare 用量…", error: "無法讀取 Cloudflare 用量，請稍後重試。",
    unconfiguredTitle: "尚未設定 Cloudflare 用量分析",
    unconfiguredDescription: "業務功能不受影響。請在 Worker 中設定唯讀 Analytics Token 與 Account ID。",
    missing: "缺少", summary: "整體狀態", reset: "UTC 重設倒數", calculating: "計算中…", unknown: "未知",
    stale: "資料可能已過期；目前顯示最近一小時內的安全快照。", observed: "觀測時間",
    observedNote: "Analytics 指標可能延遲，請以 Cloudflare Dashboard 與實際配額錯誤為準。",
    workerAccount: "Workers 帳戶請求", d1AccountRead: "D1 帳戶讀取", d1AccountWrite: "D1 帳戶寫入", d1AccountStorage: "D1 帳戶儲存",
    levels: { normal: "正常", notice: "提示", warning: "警告", critical: "嚴重", exhausted: "已耗盡" },
    duration: (days, hours, minutes) => `${days > 0 ? `${days} 天 ` : ""}${hours} 小時 ${minutes} 分`,
    workersErrorDetail: (value) => `帳戶錯誤 ${value} 次`,
  },
  en: {
    title: "Cloudflare usage",
    description: "Read-only Cloudflare account totals; the Analytics Token stays in the Worker.",
    refresh: "Refresh usage", loading: "Reading Cloudflare usage…", error: "Cloudflare usage is unavailable. Try again later.",
    unconfiguredTitle: "Cloudflare usage analytics is not configured",
    unconfiguredDescription: "Core features are unaffected. Configure a read-only Analytics Token and Account ID in the Worker.",
    missing: "Missing", summary: "Overall status", reset: "UTC reset countdown", calculating: "Calculating…", unknown: "Unknown",
    stale: "This data may be stale; the latest safe snapshot from the past hour is shown.", observed: "Observed at",
    observedNote: "Analytics metrics may be delayed. Confirm with the Cloudflare Dashboard and actual quota errors.",
    workerAccount: "Workers account requests", d1AccountRead: "D1 account reads", d1AccountWrite: "D1 account writes", d1AccountStorage: "D1 account storage",
    levels: { normal: "Normal", notice: "Notice", warning: "Warning", critical: "Critical", exhausted: "Exhausted" },
    duration: (days, hours, minutes) => `${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m`,
    workersErrorDetail: (value) => `Account errors: ${value}`,
  },
};

function warningLevel(data: ConfiguredUsage, prefix: string): UsageLevel {
  const warning = data.warnings.find((code) => code.startsWith(`${prefix}_`));
  const suffix = warning?.slice(prefix.length + 1).toLowerCase();
  return ["notice", "warning", "critical", "exhausted"].includes(suffix ?? "")
    ? suffix as UsageLevel : "normal";
}

function Metric({ label, value, limit, level, detail, copy, bytes = false }: {
  label: string; value: number; limit: number; level: UsageLevel; detail?: string; copy: UsageCopy; bytes?: boolean;
}) {
  const shown = bytes ? `${number.format(Math.round(value / 1_000_000))} MB` : number.format(value);
  const maximum = bytes ? `${number.format(Math.round(limit / 1_000_000))} MB` : number.format(limit);
  const percent = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  const readable = `${label}: ${copy.levels[level]}, ${shown} / ${maximum}`;
  return (
    <li className="usage-metric" data-level={level}>
      <div><strong>{label}</strong><span>{copy.levels[level]}</span></div>
      <progress aria-label={readable} aria-valuetext={readable} max={limit} value={Math.min(value, limit)} />
      <p><b>{shown} / {maximum}</b><span>{percent.toFixed(1)}%</span></p>
      {detail && <small>{detail}</small>}
    </li>
  );
}

function utcCountdown(resetsAt: string, now: number, copy: UsageCopy): string {
  if (!now) return copy.calculating;
  const remaining = Math.max(0, Date.parse(resetsAt) - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return copy.duration(days, hours, minutes);
}

function observed(value: string, copy: UsageCopy): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? copy.unknown : `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function CloudflareUsageSettings() {
  const usage = useUsageAlert();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <SettingsSection id="usage" title={copy.title} description={copy.description} summary={
      <button className="usage-refresh" type="button" data-focusable onClick={usage.refresh} disabled={usage.refreshDisabled}>{copy.refresh}</button>
    }>
      {usage.status === "loading" && <p role="status">{copy.loading}</p>}
      {usage.status === "error" && <p className="form-error" role="alert">{copy.error} ({usage.error})</p>}
      {usage.status === "ready" && usage.data && !usage.data.configured && (
        <div className="usage-empty">
          <h3>{copy.unconfiguredTitle}</h3>
          <p>{copy.unconfiguredDescription}</p>
          <p>{copy.missing}: {usage.data.missing.join(", ")}</p>
        </div>
      )}
      {usage.status === "ready" && usage.data?.configured && <UsageMetrics data={usage.data} now={now} copy={copy} />}
    </SettingsSection>
  );
}

function UsageMetrics({ data, now, copy }: { data: ConfiguredUsage; now: number; copy: UsageCopy }) {
  const d1 = data.d1;
  return <>
    <div className="usage-summary" data-level={data.level}>
      <strong>{copy.summary}: {copy.levels[data.level]}</strong>
      <span>{copy.reset}: {utcCountdown(data.period.resetsAt, now, copy)}</span>
    </div>
    {data.stale && <p className="usage-stale" role="status">{copy.stale}</p>}
    <ul className="usage-grid">
      <Metric label={copy.workerAccount} value={data.workers.accountRequests} limit={data.workers.accountLimit}
        level={warningLevel(data, "WORKERS_ACCOUNT")} copy={copy} detail={copy.workersErrorDetail(number.format(data.workers.accountErrors))} />
      <Metric label={copy.d1AccountRead} value={d1.accountRowsRead} limit={d1.accountRowsReadLimit}
        level={warningLevel(data, "D1_ACCOUNT_READ")} copy={copy} />
      <Metric label={copy.d1AccountWrite} value={d1.accountRowsWritten} limit={d1.accountRowsWrittenLimit}
        level={warningLevel(data, "D1_ACCOUNT_WRITE")} copy={copy} />
      <Metric label={copy.d1AccountStorage} value={d1.accountStorageBytes} limit={d1.accountStorageBytesLimit}
        level={warningLevel(data, "D1_ACCOUNT_STORAGE")} copy={copy} bytes />
    </ul>
    <p className="usage-observed">{copy.observed}: {observed(data.observedAt, copy)}. {copy.observedNote}</p>
  </>;
}
