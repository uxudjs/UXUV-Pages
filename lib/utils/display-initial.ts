export function displayInitial(...candidates: Array<string | null | undefined>): string {
  const value = candidates.find((candidate) => candidate?.trim())?.trim() ?? "";
  return Array.from(value)[0] ?? "?";
}
