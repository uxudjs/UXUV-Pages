"use client";

import { useSync, type SyncPhase } from "./SyncProvider";

const messages: Record<SyncPhase, string> = {
  loading: "正在读取本地数据并检查云端版本。",
  synced: "本地数据已与云端同步。",
  pending: "本地更改已保存，正在等待安全的同步写入窗口。",
  conflict: "检测到其他设备的更新，已在本地合并；正在按最新服务器版本重试。",
  offline: "当前离线或同步服务不可用。本地更改已保留，恢复后会重试。",
  quota: "云端存储配额已用尽。本地更改已保留且尚未同步；请等待 UTC 00:00 重置，或清理 D1 数据、升级套餐后重试。",
  error: "同步失败，本地更改仍保留在此设备。请检查数据大小或稍后重试。",
};

export function SyncStatus() {
  const sync = useSync();
  const canRetry = ["offline", "quota", "error"].includes(sync.phase);
  return (
    <aside className={`sync-status sync-status-${sync.phase}`} data-sync-status={sync.phase} role="status" aria-live="polite">
      <span>{messages[sync.phase]}</span>
      {canRetry && <button type="button" onClick={sync.retry}>重试同步</button>}
    </aside>
  );
}
