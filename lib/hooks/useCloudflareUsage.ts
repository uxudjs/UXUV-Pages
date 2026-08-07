"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";

export type UsageLevel = "normal" | "notice" | "warning" | "critical" | "exhausted";

export interface ConfiguredUsage {
  configured: true;
  period: { start: string; end: string; resetsAt: string };
  workers: { accountRequests: number; scriptRequests: number; accountErrors: number; scriptErrors: number; accountLimit: number };
  d1: {
    accountRowsRead: number; databaseRowsRead: number; accountRowsWritten: number; databaseRowsWritten: number;
    accountStorageBytes: number; databaseStorageBytes: number; accountRowsReadLimit: number;
    accountRowsWrittenLimit: number; accountStorageBytesLimit: number; databaseStorageBytesLimit: number;
    projectRowsReadGuardrail: number; projectRowsWrittenGuardrail: number;
  };
  level: UsageLevel;
  warnings: string[];
  observedAt: string;
  stale: boolean;
  source: "cloudflare-graphql";
}

export interface UnconfiguredUsage {
  configured: false;
  missing: string[];
  message: string;
}

export type CloudflareUsage = ConfiguredUsage | UnconfiguredUsage;
type UsageState = { status: "idle" | "loading" | "ready" | "error"; data: CloudflareUsage | null; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasNumbers(value: unknown, names: string[]): boolean {
  return isRecord(value) && names.every((name) => Number.isSafeInteger(value[name]) && Number(value[name]) >= 0);
}

function parseUsage(value: unknown): CloudflareUsage | null {
  if (!isRecord(value) || typeof value.configured !== "boolean") return null;
  if (!value.configured) {
    return Array.isArray(value.missing) && value.missing.every((name) => typeof name === "string")
      && typeof value.message === "string" ? value as unknown as UnconfiguredUsage : null;
  }
  if (!isRecord(value.period)) return null;
  const period = value.period;
  if (!["start", "end", "resetsAt"].every((name) => typeof period[name] === "string")) return null;
  if (!hasNumbers(value.workers, ["accountRequests", "scriptRequests", "accountErrors", "scriptErrors", "accountLimit"])) return null;
  if (!hasNumbers(value.d1, [
    "accountRowsRead", "databaseRowsRead", "accountRowsWritten", "databaseRowsWritten",
    "accountStorageBytes", "databaseStorageBytes", "accountRowsReadLimit", "accountRowsWrittenLimit",
    "accountStorageBytesLimit", "databaseStorageBytesLimit", "projectRowsReadGuardrail", "projectRowsWrittenGuardrail",
  ])) return null;
  if (!["normal", "notice", "warning", "critical", "exhausted"].includes(String(value.level))) return null;
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => typeof warning === "string")) return null;
  return typeof value.observedAt === "string" && typeof value.stale === "boolean" && value.source === "cloudflare-graphql"
    ? value as unknown as ConfiguredUsage : null;
}

async function readBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function useCloudflareUsage() {
  const auth = useAuth();
  const enabled = auth?.session.role === "super_admin";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<UsageState>({ status: "idle", data: null, error: "" });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => setState((current) => ({ status: "loading", data: current.data, error: "" })));
    const load = async () => {
      try {
        const response = await fetch("/api/admin/usage", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const body = await readBody(response);
        if (response.status === 401) auth?.markSessionExpired();
        const data = isRecord(body) ? parseUsage(body.data) : null;
        if (!response.ok || !data) throw new Error("usage unavailable");
        setState({ status: "ready", data, error: "" });
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setState({ status: "error", data: null, error: "无法读取 Cloudflare 用量，请稍后重试。" });
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt, auth, enabled]);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, refresh, enabled };
}
