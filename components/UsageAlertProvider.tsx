"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocale, type AppLocale } from "@/components/LocaleProvider";
import { useCloudflareUsage, type UsageLevel } from "@/lib/hooks/useCloudflareUsage";

type UsageContextValue = ReturnType<typeof useCloudflareUsage>;
const UsageContext = createContext<UsageContextValue | null>(null);

const alertLevels = new Set(["warning", "critical", "exhausted"]);
const COPY: Record<AppLocale, { levels: Record<UsageLevel, string>; title: (level: string) => string; detail: string }> = {
  "zh-CN": {
    levels: { normal: "正常", notice: "提示", warning: "警告", critical: "严重", exhausted: "已耗尽" },
    title: (level) => `Cloudflare 用量已达到${level}级别`,
    detail: "请检查设置页中的账户总量和本项目用量；同一 Worker 耗尽后无法保证继续发出提醒。",
  },
  "zh-TW": {
    levels: { normal: "正常", notice: "提示", warning: "警告", critical: "嚴重", exhausted: "已耗盡" },
    title: (level) => `Cloudflare 用量已達${level}級別`,
    detail: "請檢查設定頁中的帳戶總量與本專案用量；同一 Worker 耗盡後無法保證繼續發出提醒。",
  },
  en: {
    levels: { normal: "Normal", notice: "Notice", warning: "Warning", critical: "Critical", exhausted: "Exhausted" },
    title: (level) => `Cloudflare usage reached the ${level.toLowerCase()} level`,
    detail: "Review the account totals and project usage in Settings; this Worker cannot guarantee further alerts after exhaustion.",
  },
};

export function UsageAlertProvider({ children }: Readonly<{ children: ReactNode }>) {
  const usage = useCloudflareUsage();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const data = usage.status === "ready" && usage.data?.configured ? usage.data : null;
  const showAlert = !!data && alertLevels.has(data.level);

  return (
    <UsageContext.Provider value={usage}>
      {showAlert && (
        <aside className="usage-alert" data-usage-alert={data.level} role="alert" aria-live="assertive">
          <strong>{copy.title(copy.levels[data.level])}</strong>
          <span>{copy.detail}</span>
        </aside>
      )}
      {children}
    </UsageContext.Provider>
  );
}

export function useUsageAlert(): UsageContextValue {
  const value = useContext(UsageContext);
  if (!value) throw new Error("UsageAlertProvider is required.");
  return value;
}
