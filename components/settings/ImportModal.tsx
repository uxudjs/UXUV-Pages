"use client";

import { FileUp, RefreshCw, Trash2, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import {
  fetchSourceImport,
  MAX_IMPORT_BYTES,
  parseSourceImport,
  SourceImportError,
  type SourceImportErrorCode,
  type SourceImportPreview,
} from "@/lib/content/source-import";
import type { SourceSubscription, VideoSource } from "@/lib/content/types";

type ImportTab = "json" | "file" | "link" | "subscription";
const tabs: ImportTab[] = ["json", "file", "link", "subscription"];
const focusable = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const COPY = {
  "zh-CN": {
    title: "导入视频源", close: "关闭导入窗口", json: "JSON 粘贴", file: "文件", link: "链接", subscription: "订阅",
    jsonLabel: "粘贴来源 JSON", jsonHint: "支持数组，或包含 sources / list 数组的对象。", preview: "校验并预览",
    fileLabel: "选择 JSON 文件", fileEmpty: "尚未选择文件", linkLabel: "来源链接", linkHint: "链接由已登录 Worker 受控读取；浏览器不会直接访问第三方。",
    name: "订阅名称", url: "订阅链接", addSubscription: "预览并添加订阅", subscriptions: "已保存订阅", none: "尚无订阅。",
    update: "更新", remove: "删除", confirmRemove: "删除此订阅？", removeHint: "只删除订阅记录，不删除已导入的视频源。",
    cancel: "取消", confirm: "导入有效来源", valid: "有效", duplicate: "重复", invalid: "无效", total: "总计",
    noValid: "没有可导入的有效来源。", imported: "导入已保存。", loading: "正在受控读取…", fileTooLarge: "文件超过 512 KiB。",
    errors: { size: "内容超过 512 KiB。", json: "JSON 格式无效。", shape: "找不到来源数组。", secret: "内容含 Secret、Token、密码或请求头，已拒绝整个导入。", count: "一次最多导入 200 个来源。", request: "Worker 无法安全读取此链接。" },
  },
  "zh-TW": {
    title: "匯入影片來源", close: "關閉匯入視窗", json: "JSON 貼上", file: "檔案", link: "連結", subscription: "訂閱",
    jsonLabel: "貼上來源 JSON", jsonHint: "支援陣列，或包含 sources / list 陣列的物件。", preview: "驗證並預覽",
    fileLabel: "選擇 JSON 檔案", fileEmpty: "尚未選擇檔案", linkLabel: "來源連結", linkHint: "連結由已登入 Worker 受控讀取；瀏覽器不會直接存取第三方。",
    name: "訂閱名稱", url: "訂閱連結", addSubscription: "預覽並新增訂閱", subscriptions: "已儲存訂閱", none: "尚無訂閱。",
    update: "更新", remove: "刪除", confirmRemove: "刪除此訂閱？", removeHint: "只刪除訂閱紀錄，不刪除已匯入的影片來源。",
    cancel: "取消", confirm: "匯入有效來源", valid: "有效", duplicate: "重複", invalid: "無效", total: "總計",
    noValid: "沒有可匯入的有效來源。", imported: "匯入已儲存。", loading: "正在受控讀取…", fileTooLarge: "檔案超過 512 KiB。",
    errors: { size: "內容超過 512 KiB。", json: "JSON 格式無效。", shape: "找不到來源陣列。", secret: "內容含 Secret、Token、密碼或請求標頭，已拒絕整個匯入。", count: "一次最多匯入 200 個來源。", request: "Worker 無法安全讀取此連結。" },
  },
  en: {
    title: "Import video sources", close: "Close source importer", json: "Paste JSON", file: "File", link: "Link", subscription: "Subscription",
    jsonLabel: "Paste source JSON", jsonHint: "Accepts an array or an object containing a sources or list array.", preview: "Validate and preview",
    fileLabel: "Choose JSON file", fileEmpty: "No file selected", linkLabel: "Source link", linkHint: "Your signed-in Worker reads this link within strict limits; the browser never contacts the third party directly.",
    name: "Subscription name", url: "Subscription link", addSubscription: "Preview and add subscription", subscriptions: "Saved subscriptions", none: "No subscriptions yet.",
    update: "Update", remove: "Remove", confirmRemove: "Remove this subscription?", removeHint: "This removes only the subscription record, not imported video sources.",
    cancel: "Cancel", confirm: "Import valid sources", valid: "Valid", duplicate: "Duplicates", invalid: "Invalid", total: "Total",
    noValid: "There are no valid sources to import.", imported: "Import saved.", loading: "Reading through the secure Worker boundary…", fileTooLarge: "The file exceeds 512 KiB.",
    errors: { size: "Content exceeds 512 KiB.", json: "The JSON is invalid.", shape: "No source array was found.", secret: "The content contains a secret, token, password, or request headers, so the entire import was rejected.", count: "At most 200 sources can be imported at once.", request: "The Worker could not read this link safely." },
  },
} as const;

function errorCode(error: unknown): SourceImportErrorCode {
  return error instanceof SourceImportError ? error.code : "request";
}

export function ImportModal({ existingIds, subscriptions, onClose, onImport, onSaveSubscription, onRemoveSubscription }: Readonly<{
  existingIds: readonly string[];
  subscriptions: readonly SourceSubscription[];
  onClose: () => void;
  onImport: (sources: readonly VideoSource[]) => void;
  onSaveSubscription: (subscription: SourceSubscription) => void;
  onRemoveSubscription: (id: string) => void;
}>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const dialogRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<ImportTab>("json");
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState("");
  const [link, setLink] = useState("");
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [pendingSubscription, setPendingSubscription] = useState<SourceSubscription | null>(null);
  const [preview, setPreview] = useState<SourceImportPreview | null>(null);
  const [error, setError] = useState<SourceImportErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SourceSubscription | null>(null);

  useEffect(() => {
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)]
        .filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { requestRef.current?.abort(); document.removeEventListener("keydown", keydown); };
  }, [onClose]);

  const clearResult = () => { setPreview(null); setPendingSubscription(null); setError(null); setSaved(false); };
  const selectTab = (next: ImportTab) => { setTab(next); clearResult(); };
  const tabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: ImportTab) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = tabs[(tabs.indexOf(current) + offset + tabs.length) % tabs.length];
    selectTab(next);
    queueMicrotask(() => document.getElementById(`source-import-tab-${next}`)?.focus());
  };
  const parsePreview = (text: string) => {
    setSaved(false);
    try { setPreview(parseSourceImport(text, existingIds)); setError(null); }
    catch (nextError) { setPreview(null); setError(errorCode(nextError)); }
  };
  const remotePreview = async (url: string, subscription: SourceSubscription | null = null) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true); setSaved(false); setPreview(null); setPendingSubscription(subscription); setError(null);
    const ignoredIds = new Set(subscription?.sourceIds ?? []);
    try {
      const result = await fetchSourceImport(url, existingIds.filter((id) => !ignoredIds.has(id)), controller.signal);
      setPreview(result);
    } catch (nextError) {
      if (controller.signal.aborted) return;
      const code = errorCode(nextError);
      setError(code);
      if (subscription && subscriptions.some(({ id }) => id === subscription.id)) {
        onSaveSubscription({ ...subscription, lastError: code, updatedAt: Date.now() });
      }
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false); }
    }
  };
  const confirmImport = () => {
    if (!preview?.sources.length) return;
    onImport(preview.sources);
    if (pendingSubscription) {
      const now = Date.now();
      onSaveSubscription({ ...pendingSubscription, updatedAt: now, lastUpdated: now, lastError: undefined,
        sourceIds: preview.sources.map(({ id }) => id) });
    }
    setPreview(null); setPendingSubscription(null); setSaved(true);
  };
  const addSubscription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = subscriptionName.trim();
    const url = subscriptionUrl.trim();
    if (!name || !url) { setError("shape"); return; }
    const now = Date.now();
    void remotePreview(url, { id: `subscription-${crypto.randomUUID().slice(0, 8)}`, updatedAt: now, name, url, lastUpdated: 0 });
  };

  return <><button type="button" className="source-modal-backdrop" aria-label={copy.close} onClick={onClose} />
    <section ref={dialogRef} className="source-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="source-import-title">
      <header><h2 id="source-import-title"><Icon source={FileUp} size={20} />{copy.title}</h2>
        <button type="button" data-focusable aria-label={copy.close} onClick={onClose}><Icon source={X} size={18} /></button></header>
      <div className="import-tabs" role="tablist" aria-label={copy.title}>
        {tabs.map((item, index) => <button key={item} id={`source-import-tab-${item}`} type="button" role="tab"
          data-autofocus={index === 0 ? "true" : undefined} data-focusable aria-selected={tab === item}
          aria-controls={`source-import-panel-${item}`} tabIndex={tab === item ? 0 : -1}
          onKeyDown={(event) => tabKeyDown(event, item)} onClick={() => selectTab(item)}>{copy[item]}</button>)}
      </div>

      {tab === "json" && <div id="source-import-panel-json" className="import-panel" role="tabpanel" aria-labelledby="source-import-tab-json">
        <label>{copy.jsonLabel}<textarea rows={8} value={jsonText} onChange={(event) => { setJsonText(event.target.value); clearResult(); }} /></label>
        <small>{copy.jsonHint}</small><button type="button" className="primary-button" data-focusable onClick={() => parsePreview(jsonText)}>{copy.preview}</button>
      </div>}
      {tab === "file" && <div id="source-import-panel-file" className="import-panel" role="tabpanel" aria-labelledby="source-import-tab-file">
        <label>{copy.fileLabel}<input type="file" accept="application/json,.json" onChange={(event) => {
          const file = event.target.files?.[0]; clearResult(); setFileName(file?.name ?? "");
          if (!file) return;
          if (file.size > MAX_IMPORT_BYTES) { setError("size"); return; }
          void file.text().then(parsePreview).catch(() => setError("json"));
        }} /></label><small>{fileName || copy.fileEmpty}</small>
      </div>}
      {tab === "link" && <form id="source-import-panel-link" className="import-panel" role="tabpanel" aria-labelledby="source-import-tab-link"
        onSubmit={(event) => { event.preventDefault(); void remotePreview(link.trim()); }}>
        <label>{copy.linkLabel}<input type="url" required value={link} onChange={(event) => { setLink(event.target.value); clearResult(); }} placeholder="https://example.com/sources.json" /></label>
        <small>{copy.linkHint}</small><button type="submit" className="primary-button" data-focusable disabled={busy}>{copy.preview}</button>
      </form>}
      {tab === "subscription" && <div id="source-import-panel-subscription" className="import-panel" role="tabpanel" aria-labelledby="source-import-tab-subscription">
        <form className="subscription-form" onSubmit={addSubscription}>
          <label>{copy.name}<input required maxLength={160} value={subscriptionName} onChange={(event) => { setSubscriptionName(event.target.value); clearResult(); }} /></label>
          <label>{copy.url}<input required type="url" value={subscriptionUrl} onChange={(event) => { setSubscriptionUrl(event.target.value); clearResult(); }} placeholder="https://example.com/subscription.json" /></label>
          <button type="submit" className="primary-button" data-focusable disabled={busy}>{copy.addSubscription}</button>
        </form>
        <h3>{copy.subscriptions}</h3>
        {subscriptions.length === 0 ? <p>{copy.none}</p> : <ul className="subscription-list">{subscriptions.map((subscription) => <li key={subscription.id}>
          <span><strong>{subscription.name}</strong><small>{subscription.url}</small>{subscription.lastError && <em>{copy.errors.request}</em>}</span>
          <button type="button" data-focusable disabled={busy} onClick={() => void remotePreview(subscription.url, subscription)}>
            <Icon source={RefreshCw} size={15} />{copy.update}</button>
          <button type="button" data-focusable aria-label={`${copy.remove} ${subscription.name}`} onClick={() => setConfirmRemove(subscription)}>
            <Icon source={Trash2} size={15} /></button>
        </li>)}</ul>}
      </div>}

      {busy && <p className="import-status" role="status">{copy.loading}</p>}
      {error && <p className="form-error" role="alert">{copy.errors[error]}</p>}
      {saved && <p className="import-status" role="status">{copy.imported}</p>}
      {preview && <section className="import-preview" aria-labelledby="source-import-preview-title">
        <h3 id="source-import-preview-title">{copy.preview}</h3>
        <p>{copy.total}: <strong>{preview.total}</strong> · {copy.valid}: <strong>{preview.sources.length}</strong> · {copy.duplicate}: <strong>{preview.duplicates.length}</strong> · {copy.invalid}: <strong>{preview.invalid.length}</strong></p>
        {preview.sources.length ? <ul>{preview.sources.slice(0, 12).map((source) => <li key={source.id}>{source.name}<small>{source.id}</small></li>)}</ul> : <p>{copy.noValid}</p>}
        <button type="button" className="primary-button" data-focusable disabled={!preview.sources.length} onClick={confirmImport}>{copy.confirm}</button>
      </section>}
      {confirmRemove && <div className="subscription-confirm" role="alertdialog" aria-modal="true" aria-labelledby="subscription-remove-title">
        <h3 id="subscription-remove-title">{copy.confirmRemove}</h3><p>{copy.removeHint}</p>
        <div><button type="button" data-focusable onClick={() => setConfirmRemove(null)}>{copy.cancel}</button>
          <button type="button" className="danger-button" data-focusable onClick={() => { onRemoveSubscription(confirmRemove.id); setConfirmRemove(null); }}>{copy.remove}</button></div>
      </div>}
    </section></>;
}
