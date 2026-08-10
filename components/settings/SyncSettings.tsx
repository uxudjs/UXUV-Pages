"use client";

import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { SYNC_STATUS_COPY } from "@/components/SyncStatus";
import { SettingsSection } from "@/components/settings/SettingsSection";

const COPY = {
  "zh-CN": { title: "同步与离线", description: "更改会先立即保存在此设备，再通过你的 Worker 与其他设备合并。", dirty: "有未同步更改", synced: "云端版本已确认",
    phases: { loading: "检查中", synced: "已同步", pending: "等待写入", conflict: "正在合并", offline: "离线保留", quota: "配额已满", error: "同步错误" } },
  "zh-TW": { title: "同步與離線", description: "變更會先立即儲存在此裝置，再透過你的 Worker 與其他裝置合併。", dirty: "有尚未同步的變更", synced: "雲端版本已確認",
    phases: { loading: "檢查中", synced: "已同步", pending: "等待寫入", conflict: "正在合併", offline: "離線保留", quota: "配額已滿", error: "同步錯誤" } },
  en: { title: "Sync and offline", description: "Changes are saved on this device first, then merged with other devices through your Worker.", dirty: "Unsynced changes", synced: "Cloud version confirmed",
    phases: { loading: "Checking", synced: "Synced", pending: "Waiting to write", conflict: "Merging", offline: "Saved offline", quota: "Quota reached", error: "Sync error" } },
} as const;

export function SyncSettings() {
  const sync = useSync();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const statusCopy = SYNC_STATUS_COPY[locale];
  const dirty = Object.values(sync.documents).some((document) => document.dirty);
  const canRetry = ["offline", "quota", "error"].includes(sync.phase);

  return (
    <SettingsSection id="sync" title={copy.title} description={copy.description} summary={
      <span className="sync-dirty-state" data-sync-dirty={dirty}>{dirty ? copy.dirty : copy.synced}</span>
    }>
      <div className={`sync-settings-detail sync-settings-${sync.phase}`} data-sync-detail={sync.phase} role="status" aria-live="polite">
        <div><strong>{copy.phases[sync.phase]}</strong><p>{statusCopy[sync.phase]}</p></div>
        {canRetry && <button type="button" data-focusable onClick={sync.retry}>{statusCopy.retry}</button>}
      </div>
    </SettingsSection>
  );
}
