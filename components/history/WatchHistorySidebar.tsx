"use client";

import Link from "next/link";
import { History, Play, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import { historyForMode, historyRecordsForMode, MAX_VISIBLE_HISTORY } from "@/lib/content/history-policy";
import { isHistoryRecord, type HistoryRecord } from "@/lib/content/types";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";
import { useFloatingButtonPosition } from "@/lib/hooks/useFloatingButtonPosition";
import { useAuth } from "@/lib/store/auth-store";

const COPY = {
  "zh-CN": {
    open: "打开观看历史", title: "观看历史", close: "关闭观看历史", item: "条", empty: "暂无观看历史",
    emptyDetail: "播放记录会显示在这里。", remove: "删除记录", clear: "清空历史", continue: "继续播放",
    episode: "第 {episode} 集", confirmRemove: "删除这条历史记录？", confirmClear: "清空全部观看历史？",
    irreversible: "此操作无法撤销。", confirm: "确认删除", cancel: "取消",
  },
  "zh-TW": {
    open: "開啟觀看記錄", title: "觀看記錄", close: "關閉觀看記錄", item: "筆", empty: "暫無觀看記錄",
    emptyDetail: "播放記錄會顯示在這裡。", remove: "刪除記錄", clear: "清空記錄", continue: "繼續播放",
    episode: "第 {episode} 集", confirmRemove: "刪除這筆觀看記錄？", confirmClear: "清空全部觀看記錄？",
    irreversible: "此操作無法復原。", confirm: "確認刪除", cancel: "取消",
  },
  en: {
    open: "Open watch history", title: "Watch history", close: "Close watch history", item: "items", empty: "No watch history",
    emptyDetail: "Playback records will appear here.", remove: "Remove history", clear: "Clear history", continue: "Continue",
    episode: "Episode {episode}", confirmRemove: "Remove this history item?", confirmClear: "Clear all watch history?",
    irreversible: "This action cannot be undone.", confirm: "Remove", cancel: "Cancel",
  },
} as const;

function playerHref(record: HistoryRecord, premium: boolean): string {
  const query = new URLSearchParams({ id: String(record.videoId), source: record.source, title: record.title });
  if (Number.isInteger(record.episodeIndex)) query.set("episode", String(record.episodeIndex));
  if (typeof record.playbackPosition === "number") query.set("position", String(record.playbackPosition));
  if (typeof record.duration === "number") query.set("duration", String(record.duration));
  if (premium) query.set("premium", "1");
  return `/player?${query.toString()}`;
}

export function WatchHistorySidebar({ premium = false }: Readonly<{ premium?: boolean }>) {
  const auth = useAuth();
  const { locale } = useLocale();
  const { documents, removeRecord } = useSync();
  const [open, setOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<HistoryRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const copy = COPY[locale];
  const mode = premium ? "premium" : "standard";
  const floating = useFloatingButtonPosition({
    storageKey: `uxuv-floating-history:${auth?.session.accountId ?? "anonymous"}:${mode}`,
    defaultAnchor: "right",
  });
  const allHistory = useMemo(() => "history" in documents.library.payload
    ? documents.library.payload.history.filter(isHistoryRecord) : [], [documents.library.payload]);
  const modeHistory = useMemo(() => historyRecordsForMode(allHistory, mode), [allHistory, mode]);
  const visibleHistory = useMemo(() => historyForMode(allHistory, mode), [allHistory, mode]);
  const confirmationOpen = pendingRemoval !== null || confirmClear;
  useEffect(() => {
    if (confirmationOpen) queueMicrotask(() => sidebarRef.current
      ?.querySelector<HTMLElement>("[role=alertdialog] [data-autofocus]")?.focus());
  }, [confirmationOpen]);

  const close = useCallback(() => {
    setPendingRemoval(null);
    setConfirmClear(false);
    setOpen(false);
  }, []);
  const escape = useCallback(() => {
    if (confirmationOpen) {
      setPendingRemoval(null);
      setConfirmClear(false);
      queueMicrotask(() => closeRef.current?.focus());
    } else close();
  }, [close, confirmationOpen]);
  useDialogFocusTrap({ open, dialogRef: sidebarRef, returnFocusRef: openRef, onEscape: escape });
  const confirm = () => {
    if (pendingRemoval) removeRecord("library", "history", pendingRemoval.id);
    if (confirmClear) modeHistory.forEach((record) => removeRecord("library", "history", record.id));
    setPendingRemoval(null);
    setConfirmClear(false);
    queueMicrotask(() => closeRef.current?.focus());
  };

  return <>
    <button ref={openRef} type="button" className="history-sidebar-toggle" aria-label={copy.open} title={copy.open}
      style={floating.floatingStyle} onPointerDown={floating.onPointerDown} data-focusable
      onClick={(event) => { if (!floating.consumeSyntheticClick(event)) setOpen(true); }}><Icon source={History} size={24} /></button>
    {open && <><button type="button" className="history-sidebar-backdrop" aria-label={copy.close} onClick={close} />
      <aside ref={sidebarRef} className="history-sidebar is-open" role="dialog" aria-modal="true" aria-labelledby="history-sidebar-title">
        <header><div><h2 id="history-sidebar-title">{copy.title}</h2><span>{visibleHistory.length}/{MAX_VISIBLE_HISTORY} {copy.item}</span></div>
          <button ref={closeRef} type="button" data-autofocus data-focusable aria-label={copy.close} onClick={close}><Icon source={X} size={18} /></button></header>
        {visibleHistory.length === 0 ? <div className="history-sidebar-empty"><Icon source={History} size={32} />
          <strong>{copy.empty}</strong><span>{copy.emptyDetail}</span></div> : <ul>
          {visibleHistory.map((record) => <li key={record.id}>
            <Link href={playerHref(record, premium)} data-focusable prefetch={false} aria-label={`${copy.continue} ${record.title}`}>
              <span className="history-sidebar-poster" aria-hidden="true">{record.poster
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={record.poster} alt="" /> : <Icon source={Play} size={18} />}</span>
              <span><strong>{record.title}</strong><small>{record.episodeIndex === undefined ? record.source
                : copy.episode.replace("{episode}", String(record.episodeIndex + 1))}</small></span>
            </Link>
            <button type="button" data-focusable aria-label={`${copy.remove} ${record.title}`} onClick={() => setPendingRemoval(record)}>
              <Icon source={Trash2} size={16} />
            </button>
          </li>)}
        </ul>}
        {visibleHistory.length > 0 && <button type="button" className="history-clear" data-focusable onClick={() => setConfirmClear(true)}>
          <Icon source={Trash2} size={16} />{copy.clear}</button>}
        {confirmationOpen && <section className="history-confirm" role="alertdialog" aria-modal="true" aria-labelledby="history-confirm-title">
          <h3 id="history-confirm-title">{confirmClear ? copy.confirmClear : copy.confirmRemove}</h3><p>{copy.irreversible}</p>
          <div><button type="button" data-autofocus data-focusable onClick={() => { setPendingRemoval(null); setConfirmClear(false); }}>{copy.cancel}</button>
            <button type="button" className="danger-button" data-focusable onClick={confirm}>{copy.confirm}</button></div>
        </section>}
      </aside></>}
  </>;
}
