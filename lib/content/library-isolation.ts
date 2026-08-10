export type LibraryMode = "standard" | "premium";

export function libraryRecordId(mode: LibraryMode, source: string, videoId: string | number): string {
  return `${mode}:${source}:${videoId}`;
}

export function recordBelongsToMode(recordMode: unknown, mode: LibraryMode): boolean {
  return mode === "premium" ? recordMode === "premium" : recordMode !== "premium";
}
