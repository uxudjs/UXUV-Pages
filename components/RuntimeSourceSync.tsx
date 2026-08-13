"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import { fetchSourceImport } from "@/lib/content/source-import";
import type { SourceSubscription, VideoSource } from "@/lib/content/types";
import type { ConfigPayload, TimestampedRecord } from "@/lib/sync/document-types";

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

interface RuntimeSubscription {
  name: string;
  url: string;
}

function validUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseRuntimeSubscriptions(value: string): RuntimeSubscription[] {
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const url = validUrl(record.url);
      if (!url) return [];
      const name = typeof record.name === "string" && record.name.trim()
        ? record.name.trim().slice(0, 160) : `系统预设源 ${index + 1}`;
      return [{ name, url }];
    });
  } catch {
    // A plain URL or comma-separated URL list is also part of the runtime contract.
  }
  return raw.split(",").flatMap((entry, index) => {
    const url = validUrl(entry);
    return url ? [{ name: raw.includes(",") ? `系统预设源 ${index + 1}` : "系统预设源", url }] : [];
  });
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

export function RuntimeSourceSync() {
  const runtime = useRuntimeConfig();
  const { documents, phase, upsertRecord } = useSync();
  const attemptedRef = useRef("");
  const raw = runtime.config.sources?.subscriptionSources ?? "";
  const subscriptions = useMemo(() => parseRuntimeSubscriptions(raw), [raw]);
  const ready = phase !== "loading";

  useEffect(() => {
    if (!ready || !subscriptions.length || attemptedRef.current === raw) return;
    attemptedRef.current = raw;
    const controller = new AbortController();
    const payload = documents.config.payload as ConfigPayload;
    const existingSources = payload.sources.filter(isVideoSource);
    const existingSubscriptions = payload.subscriptions.filter(isSubscription);
    const now = Date.now();
    const pending = subscriptions.map((definition, index) => ({
      definition,
      index,
      existing: existingSubscriptions.find(({ url }) => url === definition.url),
    })).filter(({ existing }) => !existing || now - existing.lastUpdated >= SYNC_COOLDOWN_MS);
    if (!pending.length) return () => controller.abort();

    void Promise.allSettled(pending.map(async ({ definition, index, existing }) => {
      const ignoredIds = new Set(existing?.sourceIds ?? []);
      const preview = await fetchSourceImport(
        definition.url,
        existingSources.map(({ id }) => id).filter((id) => !ignoredIds.has(id)),
        controller.signal,
      );
      return { definition, index, existing, preview };
    })).then((settled) => {
      if (controller.signal.aborted) return;
      const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const usedSubscriptionIds = new Set(existingSubscriptions.map(({ id }) => id));
      for (const { definition, index, existing, preview } of results) {
        const updatedAt = Date.now();
        for (const source of preview.sources) upsertRecord("config", "sources", {
          ...source,
          kind: "system",
          updatedAt,
        });
        upsertRecord("config", "subscriptions", {
          ...existing,
          id: existing?.id ?? nextSubscriptionId(usedSubscriptionIds, index),
          name: definition.name,
          url: definition.url,
          lastUpdated: updatedAt,
          updatedAt,
          sourceIds: preview.sources.map(({ id }) => id),
          mode: "standard",
        });
      }
    });
    return () => controller.abort();
  }, [documents.config.payload, raw, ready, subscriptions, upsertRecord]);

  return null;
}
