export interface LocalSyncState<TPayload> {
  version: number;
  updatedAt: number | null;
  payload: TPayload;
  dirty: boolean;
  revision: number;
  retryAt: number;
}

export interface RemoteSyncState<TPayload> {
  version: number;
  updatedAt: number | null;
  payload: TPayload;
}

type MergePolicy<TPayload> = (remote: TPayload, local: TPayload) => TPayload;
type Transition<TDocument> = {
  document: TDocument;
  phase: "synced" | "pending" | "conflict";
  retryDelay: number | null;
};

export function reconcileAccepted<TPayload, TDocument extends LocalSyncState<TPayload>>(
  outgoing: TDocument,
  latest: TDocument,
  remote: RemoteSyncState<TPayload>,
  merge: MergePolicy<TPayload>,
): Transition<TDocument> {
  if (latest.revision === outgoing.revision) {
    return {
      document: { ...latest, version: remote.version, updatedAt: remote.updatedAt,
        payload: remote.payload, dirty: false, retryAt: 0 },
      phase: "synced",
      retryDelay: null,
    };
  }
  return {
    document: { ...latest, version: remote.version, updatedAt: remote.updatedAt,
      payload: merge(remote.payload, latest.payload), dirty: true },
    phase: "pending",
    retryDelay: 250,
  };
}

export function reconcileConflict<TPayload, TDocument extends LocalSyncState<TPayload>>(
  latest: TDocument,
  remote: RemoteSyncState<TPayload>,
  merge: MergePolicy<TPayload>,
  now = Date.now(),
): Transition<TDocument> {
  const retryDelay = 400;
  return {
    document: { ...latest, version: remote.version, updatedAt: remote.updatedAt,
      payload: merge(remote.payload, latest.payload), dirty: true, retryAt: now + retryDelay },
    phase: "conflict",
    retryDelay,
  };
}

export function boundedRetryDelay(retryAfterSeconds: number): number {
  const seconds = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60;
  return Math.min(300_000, Math.max(1_000, Math.ceil(seconds * 1_000)));
}
