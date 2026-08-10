"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useAuth } from "@/lib/store/auth-store";

interface AdminGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  showFallback?: boolean;
}

const COPY = {
  "zh-CN": "只有 super_admin 可以查看和修改账户。",
  "zh-TW": "只有 super_admin 可以檢視和修改帳戶。",
  en: "Only super_admin can view and modify accounts.",
} as const;

export function AdminGate({ children, fallback = null, showFallback = false }: AdminGateProps) {
  const auth = useAuth();
  const { locale } = useLocale();
  if (auth?.session?.role !== "super_admin") {
    if (fallback) return <>{fallback}</>;
    if (showFallback) return <section className="settings-section" role="status"><h2>{COPY[locale]}</h2></section>;
    return null;
  }
  return <>{children}</>;
}
