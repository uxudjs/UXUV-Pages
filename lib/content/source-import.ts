import { normalizeSourceDraft, sourceIdFromName } from "@/lib/content/source-settings-policy";
import type { VideoSource } from "@/lib/content/types";

export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_SOURCES = 200;
export const SENSITIVE_KEY = /^(?:headers?|authorization|cookie|password|secret|token|api[-_]?key)$/i;

export type SourceImportErrorCode = "size" | "json" | "shape" | "secret" | "count" | "request";

export class SourceImportError extends Error {
  constructor(readonly code: SourceImportErrorCode) {
    super(code);
    this.name = "SourceImportError";
  }
}

export interface SourceImportPreview {
  sources: VideoSource[];
  duplicates: string[];
  invalid: number[];
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsSensitiveKey(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) pending.push(...current);
    else {
      for (const [key, child] of Object.entries(current)) {
        if (SENSITIVE_KEY.test(key)) return true;
        pending.push(child);
      }
    }
  }
  return false;
}

function rowsFromPayload(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.sources)) return value.sources;
  if (Array.isArray(value.list)) return value.list;
  return null;
}

function textField(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) if (typeof record[key] === "string") return record[key];
  return "";
}

export function parseSourceImport(text: string, existingIds: readonly string[], now = Date.now()): SourceImportPreview {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new SourceImportError("size");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SourceImportError("json"); }
  if (containsSensitiveKey(value)) throw new SourceImportError("secret");
  const rows = rowsFromPayload(value);
  if (!rows) throw new SourceImportError("shape");
  if (rows.length > MAX_IMPORT_SOURCES) throw new SourceImportError("count");

  const knownIds = new Set(existingIds);
  const sources: VideoSource[] = [];
  const duplicates: string[] = [];
  const invalid: number[] = [];
  rows.forEach((row, index) => {
    if (!isRecord(row)) { invalid.push(index + 1); return; }
    const name = textField(row, "name", "title");
    const suggestedId = textField(row, "id", "key") || sourceIdFromName(name) || `import-${index + 1}`;
    const id = suggestedId.trim().toLowerCase();
    if (knownIds.has(id)) { duplicates.push(id); return; }
    const result = normalizeSourceDraft({
      name,
      id,
      baseUrl: textField(row, "baseUrl", "api", "url"),
    }, [...knownIds], null, now);
    if ("error" in result) { invalid.push(index + 1); return; }
    const source: VideoSource = {
      ...result.source,
      enabled: row.enabled !== false,
      group: row.group === "premium" ? "premium" : "normal",
      kind: "personal",
      priority: existingIds.length + sources.length + 1,
    };
    knownIds.add(source.id);
    sources.push(source);
  });
  return { sources, duplicates, invalid, total: rows.length };
}

export async function fetchSourceImport(
  url: string,
  existingIds: readonly string[],
  signal?: AbortSignal,
): Promise<SourceImportPreview> {
  const response = await fetch("/api/source-import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!response.ok) throw new SourceImportError("request");
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.text !== "string") throw new SourceImportError("request");
  return parseSourceImport(body.text, existingIds);
}
