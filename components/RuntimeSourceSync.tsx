"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import { fetchSourceImport } from "@/lib/content/source-import";
import type { SourceSubscription, VideoSource } from "@/lib/content/types";
import type { ConfigPayload, SyncCollection, TimestampedRecord } from "@/lib/sync/document-types";

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
export type RuntimeSourcePhase = "loading" | "ready" | "error";
const RuntimeSourceContext = createContext<RuntimeSourcePhase>("ready");

interface RuntimeSubscription { name: string; url: string }
interface RecordUpdate { collection: SyncCollection; record: TimestampedRecord }

function validUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function uniqueSubscriptions(items: RuntimeSubscription[]): RuntimeSubscription[] {
  const unique = new Map<string, RuntimeSubscription>();
  for (const item of items) if (!unique.has(item.url)) unique.set(item.url, item);
  return [...unique.values()];
}

function parseRuntimeSubscriptions(value: string): RuntimeSubscription[] {
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return uniqueSubscriptions(parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const url = validUrl(record.url);
      if (!url) return [];
      const name = typeof record.name === "string" && record.name.trim()
        ? record.name.trim().slice(0, 160) : `系统预设源 ${index + 1}`;
      return [{ name, url }];
    }));
  } catch { /* A plain URL or comma-separated list is also valid. */ }
  return uniqueSubscriptions(raw.split(",").flatMap((entry, index) => {
    const url = validUrl(entry);
    return url ? [{ name: raw.includes(",") ? `系统预设源 ${index + 1}` : "系统预设源", url }] : [];
  }));
}

function isSubscription(value: TimestampedRecord): value is SourceSubscription {
  return typeof value.name === "string" && typeof value.url === "string" && typeof value.lastUpdated === "number";
}

function isVideoSource(value: TimestampedRecord): value is VideoSource {
  return typeof value.name === "string" && typeof value.baseUrl === "string";
}

function nextSubscriptionId(usedIds: Set<string>, index: number): string {
  let suffix = index + 1;
  while (usedIds.has(`runtime-subscription-${suffix}`)) suffix += 1;
  const id = `runtime-subscription-${suffix}`;
  usedIds.add(id);
  return id;
}

export function useRuntimeSourcePhase(): RuntimeSourcePhase {
  return useContext(RuntimeSourceContext);
}

export function RuntimeSourceSync({ children }: Readonly<{ children: ReactNode }>) {
  const runtime = useRuntimeConfig();
  const { documents, configReady, upsertRecords } = useSync();
  const raw = runtime.config.sources?.subscriptionSources ?? "";
  const subscriptions = useMemo(() => parseRuntimeSubscriptions(raw), [raw]);
  const payloadRef = useRef(documents.config.payload as ConfigPayload);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<{ key: string; phase: RuntimeSourcePhase }>({ key: "", phase: "loading" });

  useEffect(() => { payloadRef.current = documents.config.payload as ConfigPayload; }, [documents.config.payload]);
  useEffect(() => {
    const retry = () => setAttempt((current) => current + 1);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, []);

  useEffect(() => {
    if (!configReady || !subscriptions.length) return;
    const payload = payloadRef.current;
    const existingSources = payload.sources.filter(isVideoSource);
    const existingSubscriptions = payload.subscriptions.filter(isSubscription);
    const now = Date.now();
    const pending = subscriptions.map((definition, index) => ({
      definition,
      index,
      existing: existingSubscriptions.find(({ url }) => validUrl(url) === definition.url),
    })).filter(({ existing }) => !existing || now - existing.lastUpdated >= SYNC_COOLDOWN_MS);
    if (!pending.length) { setStatus({ key: raw, phase: "ready" }); return; }

    setStatus({ key: raw, phase: "loading" });
    const controller = new AbortController();
    void Promise.allSettled(pending.map(async ({ definition, index, existing }) => {
      const ignoredIds = new Set(existing?.sourceIds ?? []);
      const preview = await fetchSourceImport(definition.url,
        existingSources.map(({ id }) => id).filter((id) => !ignoredIds.has(id)), controller.signal);
      return { definition, index, existing, preview };
    })).then((settled) => {
      if (controller.signal.aborted) return;
      const usedIds = new Set(existingSubscriptions.map(({ id }) => id));
      const updates: RecordUpdate[] = [];
      let failures = 0;
      let successes = 0;
      settled.forEach((result, resultIndex) => {
        const item = pending[resultIndex];
        const updatedAt = Date.now();
        const id = item.existing?.id ?? nextSubscriptionId(usedIds, item.index);
        if (result.status === "fulfilled") {
          successes += 1;
          result.value.preview.sources.forEach((source) => updates.push({ collection: "sources", record: {
            ...source, kind: "system", updatedAt,
          } }));
          updates.push({ collection: "subscriptions", record: {
            ...item.existing, id, name: item.definition.name, url: item.definition.url,
            lastUpdated: updatedAt, lastError: undefined, updatedAt,
            sourceIds: result.value.preview.sources.map(({ id: sourceId }) => sourceId), mode: "standard",
          } });
        } else {
          failures += 1;
          updates.push({ collection: "subscriptions", record: {
            ...item.existing, id, name: item.definition.name, url: item.definition.url,
            lastUpdated: item.existing?.lastUpdated ?? 0, lastError: "request", updatedAt,
            sourceIds: item.existing?.sourceIds ?? [], mode: "standard",
          } });
        }
      });
      upsertRecords("config", updates);
      setStatus({ key: raw, phase: failures > 0 && successes === 0 ? "error" : "ready" });
    }).catch(() => {
      if (!controller.signal.aborted) setStatus({ key: raw, phase: "error" });
    });
    return () => controller.abort();
  }, [attempt, configReady, raw, subscriptions, upsertRecords]);

  const phase = subscriptions.length === 0 ? "ready" : status.key === raw ? status.phase : "loading";
  return <RuntimeSourceContext.Provider value={phase}>{children}</RuntimeSourceContext.Provider>;
}
