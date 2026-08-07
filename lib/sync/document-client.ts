import { isRemoteDocument } from "./document-merge";
import type { LocalDocument, RemoteDocument, SyncKind } from "./document-types";

export type SyncResult =
  | { type: "ok"; document: RemoteDocument }
  | { type: "conflict"; document: RemoteDocument }
  | { type: "rate"; retryAfter: number }
  | { type: "quota" }
  | { type: "auth" }
  | { type: "unavailable" }
  | { type: "error"; code: string };

const pathFor = (kind: SyncKind) => kind === "config" ? "/api/user/config" : "/api/user/sync";

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function errorCode(value: unknown): string {
  if (!value || typeof value !== "object") return "SYNC_FAILED";
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "SYNC_FAILED";
  return typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : "SYNC_FAILED";
}

function failure(response: Response, body: unknown, kind: SyncKind): SyncResult {
  const code = errorCode(body);
  if (response.status === 401) return { type: "auth" };
  if (code === "STORAGE_QUOTA_EXCEEDED") return { type: "quota" };
  if (code === "STORAGE_UNAVAILABLE" || response.status >= 500) return { type: "unavailable" };
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    return { type: "rate", retryAfter: Number.isFinite(retryAfter) ? Math.max(1, retryAfter) : 60 };
  }
  if (response.status === 409 && body && typeof body === "object") {
    const current = (body as { error?: { details?: { current?: unknown } } }).error?.details?.current;
    if (isRemoteDocument(current, kind)) return { type: "conflict", document: current };
  }
  return { type: "error", code };
}

export async function pullRemoteDocument(kind: SyncKind): Promise<SyncResult> {
  const response = await fetch(pathFor(kind), { credentials: "same-origin", cache: "no-store" });
  const body = await readJson(response);
  return response.ok && isRemoteDocument(body, kind) ? { type: "ok", document: body } : failure(response, body, kind);
}

export async function pushRemoteDocument(document: LocalDocument): Promise<SyncResult> {
  const response = await fetch(pathFor(document.kind), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "If-Match": `"${document.version}"` },
    body: JSON.stringify({ baseVersion: document.version, payload: document.payload }),
  });
  const body = await readJson(response);
  return response.ok && isRemoteDocument(body, document.kind)
    ? { type: "ok", document: body }
    : failure(response, body, document.kind);
}
