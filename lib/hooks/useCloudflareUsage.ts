"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";

export type UsageLevel = "normal" | "notice" | "warning" | "critical" | "exhausted";

export interface ConfiguredUsage {
  configured: true;
  period: { start: string; end: string; resetsAt: string };
  workers: { accountRequests: number; accountErrors: number; accountLimit: number };
  d1: {
    accountRowsRead: number; accountRowsWritten: number; accountStorageBytes: number;
    accountRowsReadLimit: number; accountRowsWrittenLimit: number; accountStorageBytesLimit: number;
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
const LEVELS: UsageLevel[] = ["normal", "notice", "warning", "critical", "exhausted"];
const REFRESH_COOLDOWN_MS = 30_000;
const EXPECTED_LIMITS = {
  workers: 100_000,
  d1Read: 5_000_000,
  d1Write: 100_000,
  d1Storage: 5_000_000_000,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: unknown, names: string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === names.length
    && names.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}

function hasNumbers(value: unknown, names: string[]): boolean {
  return hasExactKeys(value, names)
    && names.every((name) => Number.isSafeInteger(value[name]) && Number(value[name]) >= 0);
}

function utcInstant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

function levelFor(value: number, limit: number, thresholds: readonly number[]): UsageLevel {
  const ratio = value / limit;
  if (ratio >= thresholds[3]) return "exhausted";
  if (ratio >= thresholds[2]) return "critical";
  if (ratio >= thresholds[1]) return "warning";
  if (ratio >= thresholds[0]) return "notice";
  return "normal";
}

function expectedUsageState(value: Record<string, unknown>): { level: UsageLevel; warnings: string[] } | null {
  const workers = value.workers as Record<string, number>;
  const d1 = value.d1 as Record<string, number>;
  if (workers.accountLimit !== EXPECTED_LIMITS.workers
    || d1.accountRowsReadLimit !== EXPECTED_LIMITS.d1Read
    || d1.accountRowsWrittenLimit !== EXPECTED_LIMITS.d1Write
    || d1.accountStorageBytesLimit !== EXPECTED_LIMITS.d1Storage) return null;

  const metrics: Array<[string, UsageLevel]> = [
    ["WORKERS_ACCOUNT", levelFor(workers.accountRequests, workers.accountLimit, [0.7, 0.85, 0.95, 1])],
    ["D1_ACCOUNT_READ", levelFor(d1.accountRowsRead, d1.accountRowsReadLimit, [0.85, 0.85, 0.95, 1])],
    ["D1_ACCOUNT_WRITE", levelFor(d1.accountRowsWritten, d1.accountRowsWrittenLimit, [0.85, 0.85, 0.95, 1])],
    ["D1_ACCOUNT_STORAGE", levelFor(d1.accountStorageBytes, d1.accountStorageBytesLimit, [0.85, 0.85, 0.95, 1])],
  ];
  const levels = metrics.map(([, level]) => level);
  const warnings = metrics.filter(([, level]) => level !== "normal")
    .map(([prefix, level]) => `${prefix}_${level.toUpperCase()}`);
  if (value.stale === true) {
    levels.push("notice");
    warnings.push("USAGE_DATA_STALE");
  }
  return {
    level: levels.reduce((highest, level) => LEVELS.indexOf(level) > LEVELS.indexOf(highest) ? level : highest, "normal"),
    warnings,
  };
}

function parseUsage(value: unknown): CloudflareUsage | null {
  if (!isRecord(value) || typeof value.configured !== "boolean") return null;
  if (!value.configured) {
    if (!hasExactKeys(value, ["configured", "missing", "message"]) || !Array.isArray(value.missing)) return null;
    const missing = value.missing;
    const allowed = ["CF_ANALYTICS_API_TOKEN", "CF_ACCOUNT_ID"];
    const expected = allowed.filter((name) => missing.includes(name));
    return missing.length > 0 && missing.length === expected.length
      && missing.every((name, index) => name === expected[index]) && typeof value.message === "string"
      ? value as unknown as UnconfiguredUsage : null;
  }
  if (!hasExactKeys(value, ["configured", "period", "workers", "d1", "level", "warnings", "observedAt", "stale", "source"])) return null;
  if (!hasExactKeys(value.period, ["start", "end", "resetsAt"])) return null;
  const period = value.period;
  const start = utcInstant(period.start);
  const end = utcInstant(period.end);
  const resetsAt = utcInstant(period.resetsAt);
  const observedAt = utcInstant(value.observedAt);
  if (start === null || end === null || resetsAt === null || observedAt === null
    || start % 86_400_000 !== 0 || resetsAt - start !== 86_400_000
    || end < start || end >= resetsAt || observedAt !== end) return null;
  if (!hasNumbers(value.workers, ["accountRequests", "accountErrors", "accountLimit"])) return null;
  if (!hasNumbers(value.d1, [
    "accountRowsRead", "accountRowsWritten", "accountStorageBytes",
    "accountRowsReadLimit", "accountRowsWrittenLimit", "accountStorageBytesLimit",
  ])) return null;
  if (typeof value.stale !== "boolean" || !Array.isArray(value.warnings)) return null;
  const expected = expectedUsageState(value);
  if (!expected || value.level !== expected.level
    || value.warnings.length !== expected.warnings.length
    || !value.warnings.every((warning, index) => warning === expected.warnings[index])) return null;
  return value.source === "cloudflare-graphql"
    ? value as unknown as ConfiguredUsage : null;
}

async function readBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function useCloudflareUsage() {
  const auth = useAuth();
  const enabled = auth?.session.role === "super_admin";
  const accountId = auth?.session.accountId ?? null;
  const markSessionExpiredRef = useRef(auth?.markSessionExpired);
  const activeAccountRef = useRef<string | null>(null);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshCoolingDown, setRefreshCoolingDown] = useState(false);
  const [state, setState] = useState<UsageState>({ status: "idle", data: null, error: "" });

  useEffect(() => {
    markSessionExpiredRef.current = auth?.markSessionExpired;
  }, [auth?.markSessionExpired]);

  useEffect(() => {
    let active = true;
    if (!enabled || !accountId) {
      activeAccountRef.current = null;
      queueMicrotask(() => {
        if (active) setState({ status: "idle", data: null, error: "" });
      });
      return () => { active = false; };
    }
    const retainData = activeAccountRef.current === accountId;
    activeAccountRef.current = accountId;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) setState((current) => ({ status: "loading", data: retainData ? current.data : null, error: "" }));
    });
    const load = async () => {
      try {
        const response = await fetch("/api/admin/usage", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const body = await readBody(response);
        if (response.status === 401) markSessionExpiredRef.current?.();
        const data = isRecord(body) ? parseUsage(body.data) : null;
        if (!response.ok || !data) throw new Error("usage unavailable");
        if (!controller.signal.aborted) setState({ status: "ready", data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted && (error as { name?: string }).name !== "AbortError") {
          setState({ status: "error", data: null, error: "无法读取 Cloudflare 用量，请稍后重试。" });
        }
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [accountId, attempt, enabled]);

  useEffect(() => {
    cooldownRef.current = false;
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = null;
    let active = true;
    queueMicrotask(() => {
      if (active) setRefreshCoolingDown(false);
    });
    return () => { active = false; };
  }, [accountId, enabled]);

  useEffect(() => () => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
  }, []);

  const refresh = useCallback(() => {
    if (!enabled || cooldownRef.current) return;
    cooldownRef.current = true;
    setRefreshCoolingDown(true);
    setAttempt((current) => current + 1);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
      cooldownTimerRef.current = null;
      setRefreshCoolingDown(false);
    }, REFRESH_COOLDOWN_MS);
  }, [enabled]);
  return { ...state, refresh, refreshDisabled: !enabled || refreshCoolingDown || state.status === "loading", enabled };
}
