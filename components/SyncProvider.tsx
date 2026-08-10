"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { pullRemoteDocument, pushRemoteDocument } from "@/lib/sync/document-client";
import { createLocalDocument, mergePayload, removeDocumentRecord, updateConfigField, upsertDocumentRecord } from "@/lib/sync/document-merge";
import { documentStorageKey, loadLocalDocument, saveLocalDocument } from "@/lib/sync/document-store";
import { boundedRetryDelay, reconcileAccepted, reconcileConflict } from "@/lib/sync/sync-engine";
import type { ConfigPayload, LibraryPayload, LocalDocument, SyncCollection, SyncKind, TimestampedRecord } from "@/lib/sync/document-types";

export type SyncPhase = "loading" | "synced" | "pending" | "conflict" | "offline" | "quota" | "error";
type Documents = Record<SyncKind, LocalDocument>;
type Phases = Record<SyncKind, SyncPhase>;

interface SyncContextValue {
  documents: Documents;
  phase: SyncPhase;
  retry: () => void;
  updateConfigField: (key: string, value: unknown) => void;
  replacePayload: (payloads: { config: ConfigPayload; library: LibraryPayload }) => void;
  upsertRecord: (kind: SyncKind, collection: SyncCollection, record: TimestampedRecord, syncDelay?: number) => void;
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
  const schedule = useCallback((kind: SyncKind, delay = 250, replaceScheduled = true) => {
    if (timers.current[kind]) {
      if (!replaceScheduled) return;
      window.clearTimeout(timers.current[kind]);
    }
    timers.current[kind] = window.setTimeout(() => {
      timers.current[kind] = undefined;
      void runRef.current(kind);
    }, delay);
  }, []);

  const run = useCallback(async (kind: SyncKind) => {
    if (running.current.has(kind)) return;
    const outgoing = loadLocalDocument(window.localStorage, accountId, kind);
    const remainingDelay = outgoing.dirty ? outgoing.retryAt - Date.now() : 0;
    if (remainingDelay > 0) {
      setPhase(kind, "pending");
      schedule(kind, remainingDelay, false);
      return;
    }
    running.current.add(kind);
    try {
      const result = outgoing.dirty ? await pushRemoteDocument(outgoing) : await pullRemoteDocument(kind);
      const latest = loadLocalDocument(window.localStorage, accountId, kind);
      const merge = (remote: LocalDocument["payload"], local: LocalDocument["payload"]) => mergePayload(kind, remote, local);
      if (result.type === "ok") {
        const transition = reconcileAccepted(outgoing, latest, result.document, merge);
        persist(transition.document);
        setPhase(kind, transition.phase);
        if (transition.retryDelay !== null) schedule(kind, transition.retryDelay);
      } else if (result.type === "conflict") {
        const transition = reconcileConflict(latest, result.document, merge);
        persist(transition.document);
        setPhase(kind, transition.phase);
        schedule(kind, transition.retryDelay!);
      } else if (result.type === "rate") {
        const retryDelay = boundedRetryDelay(result.retryAfter);
        persist({ ...latest, dirty: true, retryAt: Date.now() + retryDelay });
        setPhase(kind, "pending");
        schedule(kind, retryDelay);
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

  const mutate = useCallback((kind: SyncKind, update: (current: LocalDocument) => LocalDocument,
    syncDelay = 250, replaceScheduled = true) => {
    const current = loadLocalDocument(window.localStorage, accountId, kind);
    const next = update(current);
    const now = Date.now();
    const retryAt = syncDelay > 250
      ? !replaceScheduled && current.retryAt > now ? current.retryAt : now + syncDelay
      : next.retryAt;
    persist({ ...next, retryAt });
    setPhase(kind, "pending");
    schedule(kind, syncDelay, replaceScheduled);
  }, [accountId, persist, schedule, setPhase]);
  const replacePayload = useCallback((payloads: { config: ConfigPayload; library: LibraryPayload }) => {
    const previous = Object.fromEntries(kinds.map((kind) => [kind, window.localStorage.getItem(documentStorageKey(accountId, kind))])) as Record<SyncKind, string | null>;
    const next = Object.fromEntries(kinds.map((kind) => {
      const current = loadLocalDocument(window.localStorage, accountId, kind);
      return [kind, { ...current, dirty: true, revision: current.revision + 1, retryAt: 0, payload: payloads[kind] }];
    })) as unknown as Documents;
    try {
      kinds.forEach((kind) => saveLocalDocument(window.localStorage, accountId, next[kind]));
    } catch (error) {
      kinds.forEach((kind) => {
        if (previous[kind] === null) window.localStorage.removeItem(documentStorageKey(accountId, kind));
        else window.localStorage.setItem(documentStorageKey(accountId, kind), previous[kind]!);
      });
      throw error;
    }
    documentsRef.current = next;
    setDocuments(next);
    kinds.forEach((kind) => { setPhase(kind, "pending"); schedule(kind); });
  }, [accountId, schedule, setPhase]);
  const value = useMemo<SyncContextValue>(() => ({
    documents,
    phase: phasePriority.find((candidate) => Object.values(phases).includes(candidate)) ?? "synced",
    retry: () => kinds.forEach((kind) => void runRef.current(kind)),
    updateConfigField: (key, fieldValue) => mutate("config", (current) => updateConfigField(current, key, fieldValue)),
    replacePayload,
    upsertRecord: (kind, collection, record, syncDelay) => mutate(kind,
      (current) => upsertDocumentRecord(current, collection, record), syncDelay ?? 250, syncDelay === undefined),
    removeRecord: (kind, collection, id) => mutate(kind, (current) => removeDocumentRecord(current, collection, id)),
  }), [documents, mutate, phases, replacePayload]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SyncProvider is required.");
  return value;
}
