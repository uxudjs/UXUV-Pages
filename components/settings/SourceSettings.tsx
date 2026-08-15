"use client";

import { Search, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AddSourceModal } from "@/components/settings/AddSourceModal";
import { ImportModal } from "@/components/settings/ImportModal";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SourceManager } from "@/components/settings/SourceManager";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import { moveSource, orderedSources, reorderSources, sourceKind, standaloneSources } from "@/lib/content/source-settings-policy";
import type { SourceSubscription, VideoSource } from "@/lib/content/types";
import type { ConfigPayload, TimestampedRecord } from "@/lib/sync/document-types";

const COPY = {
  "zh-CN": { title: "视频源管理", description: "管理视频来源，调整优先级和启用状态", premiumTitle: "高级源管理", premiumDescription: "管理高级内容来源，调整优先级和启用状态", count: "个来源",
    system: "系统", personal: "个人", add: "添加源", import: "导入", restore: "恢复默认", search: "搜索源...", empty: "尚未配置视频源。",
    jsonSubscriptions: "JSON 订阅", independentSources: "独立来源", includedSources: (count: number) => `包含 ${count} 个来源`,
    showAll: "显示全部", collapse: "收起", enable: "启用", disable: "停用", moveUp: "上移", moveDown: "下移",
    edit: "编辑", remove: "删除", drag: "拖动排序", confirmDelete: "删除视频源？", deleteMessage: "删除后会立即从此账户的本地配置移除。",
    confirm: "确认删除", cancel: "取消", pending: "本地更改已保存，等待同步。", saved: "本地配置已保存。" },
  "zh-TW": { title: "影片來源管理", description: "管理系統與個人影片來源、優先順序和啟用狀態。", premiumTitle: "進階來源管理", premiumDescription: "管理 Premium 內容來源、優先順序、匯入和啟用狀態。", count: "個來源",
    system: "系統", personal: "個人", add: "新增來源", import: "匯入", restore: "恢復預設", search: "搜尋來源", empty: "尚未設定影片來源。",
    jsonSubscriptions: "JSON 訂閱", independentSources: "獨立來源", includedSources: (count: number) => `包含 ${count} 個來源`,
    showAll: "顯示全部", collapse: "收起", enable: "啟用", disable: "停用", moveUp: "上移", moveDown: "下移",
    edit: "編輯", remove: "刪除", drag: "拖曳排序", confirmDelete: "刪除影片來源？", deleteMessage: "刪除後會立即從此帳戶的本機設定移除。",
    confirm: "確認刪除", cancel: "取消", pending: "本機變更已儲存，等待同步。", saved: "本機設定已儲存。" },
  en: { title: "Video sources", description: "Manage system and personal sources, priority, and enabled state.", premiumTitle: "Premium sources", premiumDescription: "Manage Premium content sources, priority, imports, and enabled state.", count: "sources",
    system: "System", personal: "Personal", add: "Add source", import: "Import", restore: "Restore defaults", search: "Search sources", empty: "No video sources are configured.",
    jsonSubscriptions: "JSON subscriptions", independentSources: "independent sources", includedSources: (count: number) => `${count} sources included`,
    showAll: "Show all", collapse: "Collapse", enable: "Enable", disable: "Disable", moveUp: "Move up", moveDown: "Move down",
    edit: "Edit", remove: "Remove", drag: "Drag to reorder", confirmDelete: "Remove video source?", deleteMessage: "This source will be removed immediately from this account's local configuration.",
    confirm: "Remove", cancel: "Cancel", pending: "Local changes are saved and waiting to sync.", saved: "Local configuration is saved." },
} as const;

function isManagedSource(value: TimestampedRecord): value is VideoSource {
  return typeof value.name === "string" && typeof value.baseUrl === "string";
}

function isSubscription(value: TimestampedRecord): value is SourceSubscription {
  return typeof value.name === "string" && typeof value.url === "string" && typeof value.lastUpdated === "number";
}

export function SourceSettings({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const { locale } = useLocale();
  const { documents, phase, upsertRecord, removeRecord } = useSync();
  const copy = COPY[locale];
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<VideoSource | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VideoSource | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const importReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const config = documents.config.payload as ConfigPayload;
  const allSources = useMemo(() => config.sources.filter(isManagedSource), [config.sources]);
  const subscriptions = useMemo(() => config.subscriptions.filter(isSubscription)
    .filter((subscription) => mode === "premium" ? subscription.mode === "premium" : subscription.mode !== "premium"), [config.subscriptions, mode]);
  const sources = useMemo(() => {
    return orderedSources(standaloneSources(config.sources.filter(isManagedSource), subscriptions)
      .filter((source) => mode === "premium" ? source.group === "premium" : source.group !== "premium"));
  }, [config.sources, mode, subscriptions]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? sources.filter(({ name, baseUrl }) => `${name}\n${baseUrl}`.toLocaleLowerCase().includes(query)) : sources;
  }, [search, sources]);
  const displayed = search || expanded ? filtered : filtered.slice(0, 10);
  const systemCount = sources.filter((source) => sourceKind(source) === "system").length;
  const personalCount = sources.length - systemCount;
  const closeModal = useCallback(() => { setModalOpen(false); setEditing(null); }, []);
  const closeImport = useCallback(() => {
    setImportOpen(false);
    queueMicrotask(() => importReturnFocusRef.current?.focus());
  }, []);
  const saveSource = (source: VideoSource) => upsertRecord("config", "sources", { ...source, group: mode === "premium" ? "premium" : "normal" });
  const persistOrder = (ordered: readonly VideoSource[]) => {
    const now = Date.now();
    ordered.forEach((source, index) => upsertRecord("config", "sources", { ...source, priority: index + 1, updatedAt: now }));
  };
  const restoreDefaults = () => {
    persistOrder(sources.map((source) => sourceKind(source) === "system" ? { ...source, enabled: true } : source));
  };

  return <SettingsSection id={mode === "premium" ? "premium-sources" : "sources"}
    title={mode === "premium" ? copy.premiumTitle : copy.title} description={mode === "premium" ? copy.premiumDescription : copy.description}
    summary={<div className="source-section-summary"><span className="source-count-summary">
      {subscriptions.length} {copy.jsonSubscriptions} · {sources.length} {copy.independentSources} · {copy.system} {systemCount} · {copy.personal} {personalCount}</span>
      <div className="source-heading-actions"><button type="button" data-focusable onClick={restoreDefaults}>{copy.restore}</button>
        <button ref={importButtonRef} type="button" className="source-import-button" data-focusable onClick={() => {
          importReturnFocusRef.current = importButtonRef.current; setImportOpen(true);
        }}>{copy.import}</button>
        <button ref={addButtonRef} type="button" className="primary-button" data-focusable onClick={() => { setEditing(null); setModalOpen(true); }}>
          + {copy.add}</button></div></div>}>
    {subscriptions.length > 0 && <section className="source-subscription-summary" aria-label={copy.jsonSubscriptions}>
      <h3>{copy.jsonSubscriptions}</h3><ul>{subscriptions.map((subscription) => <li key={subscription.id}>
        <span><strong>{subscription.name}</strong><small>{subscription.url}</small></span>
        <small>{copy.includedSources(subscription.sourceIds?.length ?? 0)}</small>
      </li>)}</ul>
    </section>}
    <div className="source-toolbar"><label><span className="sr-only">{copy.search}</span><Icon source={Search} size={16} />
      <input value={search} placeholder={copy.search} aria-label={copy.search} onChange={(event) => setSearch(event.target.value)} />
      {search && <button type="button" aria-label={copy.cancel} onClick={() => setSearch("")}><Icon source={X} size={15} /></button>}</label></div>
    {displayed.length === 0 ? subscriptions.length === 0 && <p className="source-empty">{copy.empty}</p> : <SourceManager sources={displayed}
      labels={copy} onToggle={(source) => upsertRecord("config", "sources", { ...source, enabled: source.enabled === false, updatedAt: Date.now() })}
      onMove={(id, direction) => persistOrder(moveSource(sources, id, direction))}
      onReorder={(activeId, overId) => persistOrder(reorderSources(sources, activeId, overId))}
      onEdit={(source) => { setEditing(source); setModalOpen(true); }} onDelete={setConfirmDelete} />}
    {!search && sources.length > 10 && <button type="button" className="source-expand" data-focusable onClick={() => setExpanded((value) => !value)}>
      {expanded ? copy.collapse : `${copy.showAll} (${sources.length})`}</button>}
    <p className="source-local-status sr-only" role="status">{phase === "pending" || phase === "loading" ? copy.pending : copy.saved}</p>
    {modalOpen && <AddSourceModal key={editing?.id ?? "new"} initial={editing} group={mode === "premium" ? "premium" : "normal"}
      existingIds={allSources.map(({ id }) => id)} onClose={closeModal} onSave={saveSource} onImport={() => {
        closeModal(); importReturnFocusRef.current = addButtonRef.current; setImportOpen(true);
      }} />}
    {importOpen && <ImportModal existingIds={allSources.map(({ id }) => id)} subscriptions={subscriptions} onClose={closeImport}
      onImport={(imported) => imported.forEach((source) => saveSource({ ...source, group: mode === "premium" ? "premium" : "normal" }))}
      onSaveSubscription={(subscription) => upsertRecord("config", "subscriptions", { ...subscription, mode })}
      onRemoveSubscription={(id) => removeRecord("config", "subscriptions", id)} />}
    {confirmDelete && <section className="source-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="source-delete-title">
      <h3 id="source-delete-title">{copy.confirmDelete}</h3><p><strong>{confirmDelete.name}</strong> — {copy.deleteMessage}</p>
      <div><button type="button" onClick={() => setConfirmDelete(null)}>{copy.cancel}</button>
        <button type="button" className="danger-button" onClick={() => {
          removeRecord("config", "sources", confirmDelete.id); setConfirmDelete(null);
        }}>{copy.confirm}</button></div>
    </section>}
  </SettingsSection>;
}
