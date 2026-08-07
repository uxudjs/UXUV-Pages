"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { pullRemoteDocument, pushRemoteDocument } from "@/lib/sync/document-client";
import { createLocalDocument, mergePayload, removeDocumentRecord, updateConfigField, upsertDocumentRecord } from "@/lib/sync/document-merge";
import { acceptedRemoteDocument, loadLocalDocument, saveLocalDocument } from "@/lib/sync/document-store";
import type { LocalDocument, SyncCollection, SyncKind, TimestampedRecord } from "@/lib/sync/document-types";

export type SyncPhase = "loading" | "synced" | "pending" | "conflict" | "offline" | "quota" | "error";
type Documents = Record<SyncKind, LocalDocument>;
type Phases = Record<SyncKind, SyncPhase>;

interface SyncContextValue {
  documents: Documents;
  phase: SyncPhase;
  retry: () => void;
  updateConfigField: (key: string, value: unknown) => void;
  upsertRecord: (kind: SyncKind, collection: SyncCollection, record: TimestampedRecord) => void;
  removeRecord: (kind: SyncKind, collection: SyncCollection, id: string) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);
const kinds: SyncKind[] = ["config", "library"];
const phasePriority: SyncPhase[] = ["quota", "conflict", "offline", "error", "pending", "loading", "synced"];

export function SyncProvider({ accountId, children }: Readonly<{ accountId: string; children: React.ReactNode }>) {
  const auth = useAuth();
  const [documents, setDocuments] = useState<Documents>({ config: createLocalDocument("config"), library: createLocalDocument("library") });
  const [phases, setPhases] = useState<Phases>({ config: "loading", library: "loading" });
  const documentsRef = useRef(documents);
  const running = useRef(new Set<SyncKind>());
  const timers = useRef<Partial<Record<SyncKind, number>>>({});
  const runRef = useRef<(kind: SyncKind) => Promise<void>>(async () => {});

  const setPhase = useCallback((kind: SyncKind, phase: SyncPhase) => {
    setPhases((current) => ({ ...current, [kind]: phase }));
  }, []);
  const persist = useCallback((document: LocalDocument) => {
    saveLocalDocument(window.localStorage, accountId, document);
    const next = { ...documentsRef.current, [document.kind]: document };
    documentsRef.current = next;
    setDocuments(next);
  }, [accountId]);
  const schedule = useCallback((kind: SyncKind, delay = 250) => {
    if (timers.current[kind]) window.clearTimeout(timers.current[kind]);
    timers.current[kind] = window.setTimeout(() => void runRef.current(kind), delay);
  }, []);

  const run = useCallback(async (kind: SyncKind) => {
    if (running.current.has(kind)) return;
    running.current.add(kind);
    const outgoing = loadLocalDocument(window.localStorage, accountId, kind);
    try {
      const result = outgoing.dirty ? await pushRemoteDocument(outgoing) : await pullRemoteDocument(kind);
      const latest = loadLocalDocument(window.localStorage, accountId, kind);
      if (result.type === "ok") {
        if (latest.revision === outgoing.revision) persist(acceptedRemoteDocument(result.document, latest.revision));
        else {
          persist({ ...latest, version: result.document.version, updatedAt: result.document.updatedAt,
            payload: mergePayload(kind, result.document.payload, latest.payload), dirty: true });
          schedule(kind);
        }
        setPhase(kind, latest.revision === outgoing.revision ? "synced" : "pending");
      } else if (result.type === "conflict") {
        persist({ ...latest, version: result.document.version, updatedAt: result.document.updatedAt,
          payload: mergePayload(kind, result.document.payload, latest.payload), dirty: true, retryAt: Date.now() + 400 });
        setPhase(kind, "conflict");
        schedule(kind, 400);
      } else if (result.type === "rate") {
        persist({ ...latest, dirty: true, retryAt: Date.now() + (result.retryAfter * 1000) });
        setPhase(kind, "pending");
        schedule(kind, result.retryAfter * 1000);
      } else if (result.type === "quota") setPhase(kind, "quota");
      else if (result.type === "auth") auth?.markSessionExpired();
      else setPhase(kind, result.type === "unavailable" ? "offline" : "error");
    } catch {
      setPhase(kind, "offline");
    } finally {
      running.current.delete(kind);
    }
  }, [accountId, auth, persist, schedule, setPhase]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    let active = true;
    const scheduledTimers = timers.current;
    const loaded = Object.fromEntries(kinds.map((kind) => [kind, loadLocalDocument(window.localStorage, accountId, kind)])) as unknown as Documents;
    documentsRef.current = loaded;
    queueMicrotask(() => {
      if (!active) return;
      setDocuments(loaded);
      setPhases({ config: "loading", library: "loading" });
      kinds.forEach((kind) => void runRef.current(kind));
    });
    const retry = () => kinds.forEach((kind) => void runRef.current(kind));
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      active = false;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      kinds.forEach((kind) => { if (scheduledTimers[kind]) window.clearTimeout(scheduledTimers[kind]); });
    };
  }, [accountId]);

  const mutate = useCallback((kind: SyncKind, update: (current: LocalDocument) => LocalDocument) => {
    const next = update(loadLocalDocument(window.localStorage, accountId, kind));
    persist(next);
    setPhase(kind, "pending");
    schedule(kind);
  }, [accountId, persist, schedule, setPhase]);
  const value = useMemo<SyncContextValue>(() => ({
    documents,
    phase: phasePriority.find((candidate) => Object.values(phases).includes(candidate)) ?? "synced",
    retry: () => kinds.forEach((kind) => void runRef.current(kind)),
    updateConfigField: (key, fieldValue) => mutate("config", (current) => updateConfigField(current, key, fieldValue)),
    upsertRecord: (kind, collection, record) => mutate(kind, (current) => upsertDocumentRecord(current, collection, record)),
    removeRecord: (kind, collection, id) => mutate(kind, (current) => removeDocumentRecord(current, collection, id)),
  }), [documents, mutate, phases]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SyncProvider is required.");
  return value;
}
