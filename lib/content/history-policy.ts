import type { HistoryRecord } from "@/lib/content/types";
import { recordBelongsToMode } from "@/lib/content/library-isolation";

export const MAX_VISIBLE_HISTORY = 50;
export type HistoryMode = "standard" | "premium";

export function historyRecordsForMode(records: readonly HistoryRecord[], mode: HistoryMode): HistoryRecord[] {
  return records.filter((record) => recordBelongsToMode(record.mode, mode));
}

export function historyForMode(records: readonly HistoryRecord[], mode: HistoryMode): HistoryRecord[] {
  return historyRecordsForMode(records, mode)
    .map((record, originalIndex) => ({ record, originalIndex }))
    .sort((left, right) => right.record.updatedAt - left.record.updatedAt || left.originalIndex - right.originalIndex)
    .map(({ record }) => record)
    .slice(0, MAX_VISIBLE_HISTORY);
}
