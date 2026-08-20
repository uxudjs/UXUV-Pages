"use client";

import Link from "next/link";
import { Heart, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import { favoritesForMode, MAX_FAVORITES } from "@/lib/content/favorites-policy";
import { isFavoriteRecord, type FavoriteRecord } from "@/lib/content/types";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";
import { useFloatingButtonPosition } from "@/lib/hooks/useFloatingButtonPosition";
import { useAuth } from "@/lib/store/auth-store";

const COPY = {
  "zh-CN": { open: "打开收藏夹", title: "收藏夹", empty: "暂无收藏", remove: "取消收藏", all: "查看全部收藏", close: "关闭收藏夹", item: "项",
    clear: "清空收藏", confirmRemove: "取消这项收藏？", confirmClear: "清空全部收藏？", irreversible: "此操作无法撤销。", confirm: "确认删除", cancel: "取消" },
  "zh-TW": { open: "開啟收藏夾", title: "收藏夾", empty: "暫無收藏", remove: "取消收藏", all: "查看全部收藏", close: "關閉收藏夾", item: "項",
    clear: "清空收藏", confirmRemove: "取消這項收藏？", confirmClear: "清空全部收藏？", irreversible: "此操作無法復原。", confirm: "確認刪除", cancel: "取消" },
  en: { open: "Open favorites", title: "Favorites", empty: "No favorites yet", remove: "Remove favorite", all: "View all favorites", close: "Close favorites", item: "items",
    clear: "Clear favorites", confirmRemove: "Remove this favorite?", confirmClear: "Clear all favorites?", irreversible: "This action cannot be undone.", confirm: "Remove", cancel: "Cancel" },
} as const;

function playerHref(favorite: FavoriteRecord, premium: boolean) {
  const query = new URLSearchParams({ id: String(favorite.videoId), source: favorite.source, title: favorite.title });
  if (premium) query.set("premium", "1");
  return `/player?${query.toString()}`;
}

export function FavoritesSidebar({ premium = false }: Readonly<{ premium?: boolean }>) {
  const auth = useAuth();
  const { locale } = useLocale();
  const { documents, removeRecord } = useSync();
  const [open, setOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<FavoriteRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mode = premium ? "premium" : "standard";
  const copy = COPY[locale];
  const floating = useFloatingButtonPosition({
    storageKey: `uxuv-floating-favorites:${auth?.session.accountId ?? "anonymous"}:${mode}`,
    defaultAnchor: "left",
  });
  const favorites = useMemo(() => favoritesForMode("favorites" in documents.library.payload
    ? documents.library.payload.favorites.filter(isFavoriteRecord) : [], mode)
    .sort((a, b) => b.addedAt - a.addedAt), [documents.library.payload, mode]);
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
    if (pendingRemoval) removeRecord("library", "favorites", pendingRemoval.id);
    if (confirmClear) favorites.forEach(({ id }) => removeRecord("library", "favorites", id));
    setPendingRemoval(null);
    setConfirmClear(false);
    queueMicrotask(() => closeRef.current?.focus());
  };
  return <>
    <button ref={openRef} type="button" className="favorites-sidebar-toggle" data-material="regular" aria-label={copy.open} title={copy.open}
      style={floating.floatingStyle} onPointerDown={floating.onPointerDown} data-focusable
      onClick={(event) => { if (!floating.consumeSyntheticClick(event)) setOpen(true); }}><Icon source={Heart} size={24} /></button>
    {open && <><button type="button" className="favorites-sidebar-backdrop" aria-label={copy.close} onClick={close} />
    <aside ref={sidebarRef} className="favorites-sidebar is-open" data-material="regular" role="dialog" aria-modal="true"
      aria-labelledby="favorites-sidebar-title">
      <header><div><h2 id="favorites-sidebar-title">{copy.title}</h2><span>{favorites.length}/{MAX_FAVORITES} {copy.item}</span></div>
        <button ref={closeRef} type="button" data-autofocus data-focusable aria-label={copy.close} onClick={close}><Icon source={X} size={18} /></button></header>
      {favorites.length === 0 ? <p className="favorites-sidebar-empty">{copy.empty}</p> : <ul>
        {favorites.slice(0, 10).map((favorite) => <li key={favorite.id}>
          <Link href={playerHref(favorite, premium)} data-focusable prefetch={false}><strong>{favorite.title}</strong><span>{favorite.sourceName || favorite.source}</span></Link>
          <button type="button" data-focusable aria-label={`${copy.remove} ${favorite.title}`}
            onClick={() => setPendingRemoval(favorite)}><Icon source={Trash2} size={16} /></button>
        </li>)}
      </ul>}
      {favorites.length > 0 && <button type="button" className="history-clear" data-focusable onClick={() => setConfirmClear(true)}>
        <Icon source={Trash2} size={16} />{copy.clear}</button>}
      <Link className="primary-link" data-focusable href={premium ? "/premium/favorites" : "/favorites"} prefetch={false}
        onClick={close}>{copy.all}</Link>
      {confirmationOpen && <section className="history-confirm" data-material="regular" role="alertdialog" aria-modal="true" aria-labelledby="favorites-confirm-title">
        <h3 id="favorites-confirm-title">{confirmClear ? copy.confirmClear : copy.confirmRemove}</h3><p>{copy.irreversible}</p>
        <div><button type="button" data-autofocus data-focusable onClick={() => { setPendingRemoval(null); setConfirmClear(false); }}>{copy.cancel}</button>
          <button type="button" className="danger-button" data-focusable onClick={confirm}>{copy.confirm}</button></div>
      </section>}
    </aside></>}
  </>;
}
