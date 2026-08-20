export type SyncKind = "config" | "library";
export type ConfigCollection = "sources" | "subscriptions";
export type LibraryCollection = "history" | "favorites";
export type SyncCollection = ConfigCollection | LibraryCollection;

export interface TimestampedField {
  value: unknown;
  updatedAt: number;
}

export interface VideoSkipRule {
  introEnabled: boolean;
  introSeconds: number;
  outroEnabled: boolean;
  outroSeconds: number;
  updatedAt: number;
}

export interface VideoSkipRulesField extends TimestampedField {
  value: Record<string, VideoSkipRule>;
}

export interface TimestampedRecord {
  id: string;
  updatedAt: number;
  [key: string]: unknown;
}

export interface SyncTombstone {
  collection: SyncCollection;
  id: string;
  deletedAt: number;
}

export interface ConfigPayload {
  fields: Record<string, TimestampedField> & { videoSkipRules?: VideoSkipRulesField };
  sources: TimestampedRecord[];
  subscriptions: TimestampedRecord[];
  tombstones: SyncTombstone[];
}

export interface LibraryPayload {
  history: TimestampedRecord[];
  favorites: TimestampedRecord[];
  tombstones: SyncTombstone[];
}

export type SyncPayload = ConfigPayload | LibraryPayload;

export interface RemoteDocument {
  kind: SyncKind;
  version: number;
  updatedAt: number | null;
  payload: SyncPayload;
}

export interface LocalDocument extends RemoteDocument {
  dirty: boolean;
  revision: number;
  retryAt: number;
}
