import type {
  ConfigPayload, LocalDocument, RemoteDocument, SyncCollection, SyncKind,
  SyncPayload, SyncTombstone, TimestampedRecord,
} from "./document-types";

const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECORD_ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const FIELD_KEY = /^[A-Za-z0-9_.-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validFields(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([key, field]) => FIELD_KEY.test(key)
    && isRecord(field)
    && Object.prototype.hasOwnProperty.call(field, "value")
    && isTimestamp(field.updatedAt));
}

function validRecords(value: unknown): boolean {
  return Array.isArray(value) && value.every((record) => isRecord(record)
    && typeof record.id === "string" && RECORD_ID.test(record.id) && isTimestamp(record.updatedAt));
}

function validTombstones(value: unknown, collections: ReadonlySet<string>): boolean {
  return Array.isArray(value) && value.every((tombstone) => isRecord(tombstone)
    && typeof tombstone.collection === "string" && collections.has(tombstone.collection)
    && typeof tombstone.id === "string" && RECORD_ID.test(tombstone.id)
    && isTimestamp(tombstone.deletedAt));
}

function validPayload(value: unknown, kind: SyncKind): value is SyncPayload {
  if (!isRecord(value)) return false;
  const collections = new Set(kind === "config" ? ["sources", "subscriptions"] : ["history", "favorites"]);
  if (!validTombstones(value.tombstones, collections)) return false;
  return kind === "config"
    ? validFields(value.fields) && validRecords(value.sources) && validRecords(value.subscriptions)
    : validRecords(value.history) && validRecords(value.favorites);
}

export function emptyPayload(kind: SyncKind): SyncPayload {
  return kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] };
}

export function createLocalDocument(kind: SyncKind): LocalDocument {
  return { kind, version: 0, updatedAt: null, payload: emptyPayload(kind), dirty: false, revision: 0, retryAt: 0 };
}

function newer<T extends object>(left: T | undefined, right: T, timestamp: keyof T): T {
  if (!left) return right;
  const leftTime = left[timestamp] as number;
  const rightTime = right[timestamp] as number;
  if (leftTime !== rightTime) return rightTime > leftTime ? right : left;
  return JSON.stringify(right) > JSON.stringify(left) ? right : left;
}

function mergeTombstones(left: SyncTombstone[], right: SyncTombstone[], now: number): SyncTombstone[] {
  const merged = new Map<string, SyncTombstone>();
  const cutoff = now - TOMBSTONE_RETENTION_MS;
  for (const tombstone of [...left, ...right]) {
    if (tombstone.deletedAt < cutoff) continue;
    const key = `${tombstone.collection}:${tombstone.id}`;
    merged.set(key, newer(merged.get(key), tombstone, "deletedAt"));
  }
  return [...merged.values()].sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id));
}

function mergeRecords(
  left: TimestampedRecord[], right: TimestampedRecord[], tombstones: SyncTombstone[], collection: SyncCollection,
): TimestampedRecord[] {
  const merged = new Map<string, TimestampedRecord>();
  for (const record of [...left, ...right]) merged.set(record.id, newer(merged.get(record.id), record, "updatedAt"));
  for (const tombstone of tombstones) {
    if (tombstone.collection !== collection) continue;
    const record = merged.get(tombstone.id);
    if (!record) continue;
    const recreatedAt = record.recreatedAt;
    const explicitlyRecreated = isTimestamp(recreatedAt)
      && recreatedAt <= record.updatedAt && recreatedAt > tombstone.deletedAt;
    if (!explicitlyRecreated) merged.delete(tombstone.id);
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function mergePayload(kind: SyncKind, left: SyncPayload, right: SyncPayload, now = Date.now()): SyncPayload {
  const tombstones = mergeTombstones(left.tombstones, right.tombstones, now);
  if (kind === "config") {
    const a = left as ConfigPayload;
    const b = right as ConfigPayload;
    const fields = new Map(Object.entries(a.fields));
    for (const [key, field] of Object.entries(b.fields)) fields.set(key, newer(fields.get(key), field, "updatedAt"));
    return {
      fields: Object.fromEntries([...fields.entries()].sort(([x], [y]) => x.localeCompare(y))),
      sources: mergeRecords(a.sources, b.sources, tombstones, "sources"),
      subscriptions: mergeRecords(a.subscriptions, b.subscriptions, tombstones, "subscriptions"),
      tombstones,
    };
  }
  const a = left as Extract<SyncPayload, { history: unknown }>;
  const b = right as Extract<SyncPayload, { history: unknown }>;
  return {
    history: mergeRecords(a.history, b.history, tombstones, "history"),
    favorites: mergeRecords(a.favorites, b.favorites, tombstones, "favorites"),
    tombstones,
  };
}

export function updateConfigField(document: LocalDocument, key: string, value: unknown, now = Date.now()): LocalDocument {
  if (document.kind !== "config" || !FIELD_KEY.test(key)) throw new Error("Invalid config field.");
  const payload = document.payload as ConfigPayload;
  return { ...document, dirty: true, revision: document.revision + 1, retryAt: 0,
    payload: { ...payload, fields: { ...payload.fields, [key]: { value, updatedAt: now } } } };
}

export function upsertDocumentRecord(
  document: LocalDocument, collection: SyncCollection, record: TimestampedRecord,
): LocalDocument {
  if (!RECORD_ID.test(record.id) || !isTimestamp(record.updatedAt)) throw new Error("Invalid record.");
  const payload = document.payload as unknown as Record<string, unknown>;
  const records = payload[collection];
  if (!Array.isArray(records)) throw new Error("Invalid document collection.");
  const deletion = document.payload.tombstones.find((tombstone) => tombstone.collection === collection && tombstone.id === record.id);
  let nextRecord = record;
  if (deletion) {
    const recreatedAt = Math.max(record.updatedAt, deletion.deletedAt + 1);
    if (!isTimestamp(recreatedAt)) throw new Error("Invalid recreation timestamp.");
    nextRecord = { ...record, updatedAt: recreatedAt, recreatedAt };
  }
  const next = mergeRecords(records as TimestampedRecord[], [nextRecord], document.payload.tombstones, collection);
  return { ...document, dirty: true, revision: document.revision + 1, retryAt: 0,
    payload: { ...document.payload, [collection]: next } };
}

export function removeDocumentRecord(
  document: LocalDocument, collection: SyncCollection, id: string, now = Date.now(),
): LocalDocument {
  if (!RECORD_ID.test(id)) throw new Error("Invalid record id.");
  const tombstone = { collection, id, deletedAt: now } as SyncTombstone;
  const payload = mergePayload(document.kind, document.payload, {
    ...emptyPayload(document.kind), tombstones: [tombstone],
  }, now);
  return { ...document, payload, dirty: true, revision: document.revision + 1, retryAt: 0 };
}

export function isRemoteDocument(value: unknown, kind: SyncKind): value is RemoteDocument {
  if (!isRecord(value)) return false;
  const record = value as Partial<RemoteDocument>;
  return record.kind === kind && Number.isSafeInteger(record.version) && (record.version ?? -1) >= 0
    && (record.updatedAt === null || isTimestamp(record.updatedAt))
    && validPayload(record.payload, kind);
}
