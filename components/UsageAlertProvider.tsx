"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCloudflareUsage } from "@/lib/hooks/useCloudflareUsage";

type UsageContextValue = ReturnType<typeof useCloudflareUsage>;
const UsageContext = createContext<UsageContextValue | null>(null);

const alertLevels = new Set(["warning", "critical", "exhausted"]);
const levelLabels = {
  normal: "正常",
  notice: "提示",
  warning: "警告",
  critical: "严重",
  exhausted: "已耗尽",
} as const;

export function UsageAlertProvider({ children }: Readonly<{ children: ReactNode }>) {
  const usage = useCloudflareUsage();
  const data = usage.status === "ready" && usage.data?.configured ? usage.data : null;
  const showAlert = !!data && alertLevels.has(data.level);

  return (
    <UsageContext.Provider value={usage}>
      {showAlert && (
        <aside className="usage-alert" data-usage-alert={data.level} role="alert" aria-live="assertive">
          <strong>Cloudflare 用量已达到{levelLabels[data.level]}级别</strong>
          <span>请检查设置页中的账户总量和本项目用量；同一 Worker 耗尽后无法保证继续发出提醒。</span>
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
