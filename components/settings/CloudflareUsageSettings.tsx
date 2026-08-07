"use client";

import { useEffect, useState } from "react";
import { useUsageAlert } from "@/components/UsageAlertProvider";
import type { ConfiguredUsage, UsageLevel } from "@/lib/hooks/useCloudflareUsage";

const number = new Intl.NumberFormat("en-US");
const levelLabels: Record<UsageLevel, string> = {
  normal: "正常", notice: "提示", warning: "警告", critical: "严重", exhausted: "已耗尽",
};

function warningLevel(data: ConfiguredUsage, prefix: string): UsageLevel {
  const warning = data.warnings.find((code) => code.startsWith(`${prefix}_`));
  const suffix = warning?.slice(prefix.length + 1).toLowerCase();
  return ["notice", "warning", "critical", "exhausted"].includes(suffix ?? "")
    ? suffix as UsageLevel : "normal";
}

function Metric({ label, value, limit, level, detail, bytes = false }: {
  label: string; value: number; limit: number; level: UsageLevel; detail: string; bytes?: boolean;
}) {
  const shown = bytes ? `${number.format(Math.round(value / 1_000_000))} MB` : number.format(value);
  const maximum = bytes ? `${number.format(Math.round(limit / 1_000_000))} MB` : number.format(limit);
  const percent = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  const readable = `${label}：${levelLabels[level]}，${shown} / ${maximum}`;
  return (
    <li className="usage-metric" data-level={level}>
      <div><strong>{label}</strong><span>{levelLabels[level]}</span></div>
      <progress aria-label={readable} aria-valuetext={readable} max={limit} value={Math.min(value, limit)} />
      <p><b>{shown} / {maximum}</b><span>{percent.toFixed(1)}%</span></p>
      <small>{detail}</small>
    </li>
  );
}

function utcCountdown(resetsAt: string, now: number): string {
  if (!now) return "计算中…";
  const remaining = Math.max(0, Date.parse(resetsAt) - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${days > 0 ? `${days} 天 ` : ""}${hours} 小时 ${minutes} 分`;
}

function observed(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function CloudflareUsageSettings() {
  const usage = useUsageAlert();
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="settings-section usage-settings" id="cloudflare-usage-settings" aria-labelledby="usage-settings-title">
      <div className="section-heading">
        <div><p className="public-kicker">运行配额</p><h2 id="usage-settings-title">Cloudflare 用量</h2></div>
        <button type="button" onClick={usage.refresh} disabled={usage.status === "loading"}>刷新用量</button>
      </div>
      {usage.status === "loading" && <p role="status">正在读取 Cloudflare 用量…</p>}
      {usage.status === "error" && <p className="form-error" role="alert">{usage.error}</p>}
      {usage.status === "ready" && usage.data && !usage.data.configured && (
        <div className="usage-empty">
          <h3>尚未配置 Cloudflare 用量分析</h3>
          <p>业务功能不受影响。请在 Worker 中配置只读 Analytics Token 与三个项目标识。</p>
          <p>缺少：{usage.data.missing.join("、")}</p>
        </div>
      )}
      {usage.status === "ready" && usage.data?.configured && <UsageMetrics data={usage.data} now={now} />}
    </section>
  );
}

function UsageMetrics({ data, now }: { data: ConfiguredUsage; now: number }) {
  const d1 = data.d1;
  return <>
    <div className="usage-summary" data-level={data.level}>
      <strong>总体状态：{levelLabels[data.level]}</strong>
      <span>UTC 重置倒计时：{utcCountdown(data.period.resetsAt, now)}</span>
    </div>
    {data.stale && <p className="usage-stale" role="status">数据可能已陈旧；当前显示最近一小时内的安全快照。</p>}
    <ul className="usage-grid">
      <Metric label="Workers 账户请求" value={data.workers.accountRequests} limit={data.workers.accountLimit}
        level={warningLevel(data, "WORKERS_ACCOUNT")} detail={`本脚本 ${number.format(data.workers.scriptRequests)} 次`} />
      <Metric label="D1 账户读取" value={d1.accountRowsRead} limit={d1.accountRowsReadLimit}
        level={warningLevel(data, "D1_ACCOUNT_READ")} detail={`本数据库 ${number.format(d1.databaseRowsRead)} 行 · 项目警戒线 ${number.format(d1.projectRowsReadGuardrail)} 行`} />
      <Metric label="D1 账户写入" value={d1.accountRowsWritten} limit={d1.accountRowsWrittenLimit}
        level={warningLevel(data, "D1_ACCOUNT_WRITE")} detail={`本数据库 ${number.format(d1.databaseRowsWritten)} 行 · 项目警戒线 ${number.format(d1.projectRowsWrittenGuardrail)} 行`} />
      <Metric label="D1 本数据库存储" value={d1.databaseStorageBytes} limit={d1.databaseStorageBytesLimit}
        level={warningLevel(data, "D1_DATABASE_STORAGE")} bytes detail={`账户总存储 ${number.format(Math.round(d1.accountStorageBytes / 1_000_000))} MB`} />
    </ul>
    <p className="usage-observed">观测时间：{observed(data.observedAt)}。Analytics 指标可能延迟，请以 Cloudflare Dashboard 和实际配额错误为准。</p>
  </>;
}
