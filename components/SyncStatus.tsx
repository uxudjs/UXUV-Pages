"use client";

import { useLocale } from "./LocaleProvider";
import { useSync, type SyncPhase } from "./SyncProvider";

export const SYNC_STATUS_COPY: Record<"zh-CN" | "zh-TW" | "en", Record<SyncPhase, string> & { retry: string }> = {
  "zh-CN": {
    loading: "正在读取本地数据并检查云端版本。", synced: "本地数据已与云端同步。",
    pending: "本地更改已保存，正在等待安全的同步写入窗口。",
    conflict: "检测到其他设备的更新，已在本地合并；正在按最新服务器版本重试。",
    offline: "当前离线或同步服务不可用。本地更改已保留，恢复后会重试。",
    quota: "云端存储配额已用尽。本地更改已保留且尚未同步；请等待 UTC 00:00 重置，或清理 D1 数据、升级套餐后重试。",
    error: "同步失败，本地更改仍保留在此设备。请检查数据大小或稍后重试。", retry: "重试同步",
  },
  "zh-TW": {
    loading: "正在讀取本機資料並檢查雲端版本。", synced: "本機資料已與雲端同步。",
    pending: "本機變更已儲存，正在等待安全的同步寫入時段。",
    conflict: "偵測到其他裝置的更新，已在本機合併；正在依最新伺服器版本重試。",
    offline: "目前離線或同步服務無法使用。本機變更已保留，恢復後會重試。",
    quota: "雲端儲存配額已用盡。本機變更已保留且尚未同步；請等待 UTC 00:00 重設，或清理 D1 資料、升級方案後重試。",
    error: "同步失敗，本機變更仍保留在此裝置。請檢查資料大小或稍後重試。", retry: "重試同步",
  },
  en: {
    loading: "Reading local data and checking the cloud version.", synced: "Local data is synced with the cloud.",
    pending: "Local changes are saved and waiting for a safe sync window.",
    conflict: "Another device changed this data. The local merge is retrying against the latest server version.",
    offline: "The device is offline or sync is unavailable. Local changes are preserved and will retry after recovery.",
    quota: "Cloud storage quota is exhausted. Local changes remain unsynced; wait for the UTC 00:00 reset, clean D1 data, or upgrade the plan.",
    error: "Sync failed. Local changes remain on this device; check the data size or retry later.", retry: "Retry sync",
  },
};

export function SyncStatus() {
  const sync = useSync();
  const { locale } = useLocale();
  const copy = SYNC_STATUS_COPY[locale];
  const canRetry = ["offline", "quota", "error"].includes(sync.phase);
  return (
    <aside className={`sync-status sync-status-${sync.phase}${sync.phase === "synced" ? " sr-only" : ""}`} data-sync-status={sync.phase} role="status" aria-live="polite">
      <span>{copy[sync.phase]}</span>
      {canRetry && <button type="button" data-focusable onClick={sync.retry}>{copy.retry}</button>}
    </aside>
  );
}
