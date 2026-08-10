import { createLocalDocument, isRemoteDocument } from "./document-merge";
import type { LocalDocument, SyncKind } from "./document-types";

type StorageAdapter = Pick<Storage, "getItem" | "setItem">;
const STORAGE_PREFIX = "uxuv-sync-v1";

export function documentStorageKey(accountId: string, kind: SyncKind): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(accountId)}:${kind}`;
}

export function loadLocalDocument(storage: StorageAdapter, accountId: string, kind: SyncKind): LocalDocument {
  const fallback = createLocalDocument(kind);
  try {
    const value: unknown = JSON.parse(storage.getItem(documentStorageKey(accountId, kind)) ?? "null");
    if (!isRemoteDocument(value, kind)) return fallback;
    const local = value as Partial<LocalDocument>;
    return {
      ...value,
      dirty: local.dirty === true,
      revision: Number.isSafeInteger(local.revision) && (local.revision ?? -1) >= 0 ? local.revision as number : 0,
      retryAt: Number.isSafeInteger(local.retryAt) && (local.retryAt ?? -1) >= 0 ? local.retryAt as number : 0,
    };
  } catch {
    return fallback;
  }
}

export function saveLocalDocument(storage: StorageAdapter, accountId: string, document: LocalDocument): void {
  storage.setItem(documentStorageKey(accountId, document.kind), JSON.stringify(document));
}
