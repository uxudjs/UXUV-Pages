"use client";

import { FileUp, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import { normalizeSourceDraft, sourceIdFromName, type SourceDraftError } from "@/lib/content/source-settings-policy";
import type { VideoSource } from "@/lib/content/types";

const COPY = {
  "zh-CN": { addTitle: "添加单独来源", editTitle: "编辑单独来源", premiumAddTitle: "添加 Premium 视频源", premiumEditTitle: "编辑 Premium 视频源", name: "源名称", id: "源 ID", url: "接口地址",
    idHint: "仅支持小写字母、数字和连字符。", cancel: "取消", add: "添加", save: "保存", import: "导入来源", close: "关闭来源编辑器",
    errors: { required: "请填写所有字段。", id: "源 ID 格式无效。", duplicate: "此源 ID 已存在。", url: "请输入有效的 HTTP 或 HTTPS 地址。" } },
  "zh-TW": { addTitle: "新增單獨來源", editTitle: "編輯單獨來源", premiumAddTitle: "新增 Premium 影片來源", premiumEditTitle: "編輯 Premium 影片來源", name: "來源名稱", id: "來源 ID", url: "介面位址",
    idHint: "僅支援小寫字母、數字和連字號。", cancel: "取消", add: "新增", save: "儲存", import: "匯入來源", close: "關閉來源編輯器",
    errors: { required: "請填寫所有欄位。", id: "來源 ID 格式無效。", duplicate: "此來源 ID 已存在。", url: "請輸入有效的 HTTP 或 HTTPS 位址。" } },
  en: { addTitle: "Add standalone source", editTitle: "Edit standalone source", premiumAddTitle: "Add Premium video source", premiumEditTitle: "Edit Premium video source", name: "Source name", id: "Source ID", url: "API URL",
    idHint: "Use lowercase letters, numbers, and hyphens only.", cancel: "Cancel", add: "Add", save: "Save", import: "Import sources", close: "Close source editor",
    errors: { required: "Complete every field.", id: "The source ID is invalid.", duplicate: "That source ID already exists.", url: "Enter a valid HTTP or HTTPS URL." } },
} as const;

export function AddSourceModal({ initial, existingIds, onClose, onSave, onImport, group = "normal" }: Readonly<{
  initial: VideoSource | null;
  existingIds: readonly string[];
  onClose: () => void;
  onSave: (source: VideoSource) => void;
  onImport?: () => void;
  group?: "normal" | "premium";
}>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [manualId, setManualId] = useState(!!initial);
  const [fallbackId] = useState(() => `personal-${crypto.randomUUID().slice(0, 8)}`);
  const [error, setError] = useState<SourceDraftError | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => nameRef.current?.focus());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = normalizeSourceDraft({ name, id, baseUrl }, existingIds, initial, Date.now(), group);
    if ("error" in result) { setError(result.error); return; }
    onSave(result.source);
    onClose();
  };
  return <><button type="button" className="source-modal-backdrop" aria-label={copy.close} onClick={onClose} />
    <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-modal-title">
      <header><h2 id="source-modal-title">{group === "premium" ? (initial ? copy.premiumEditTitle : copy.premiumAddTitle) : (initial ? copy.editTitle : copy.addTitle)}</h2>
        <button type="button" aria-label={copy.close} onClick={onClose}><Icon source={X} size={18} /></button></header>
      <form onSubmit={submit} noValidate>
        <label>{copy.name}<input ref={nameRef} required maxLength={160} value={name} onChange={(event) => {
          const nextName = event.target.value; setName(nextName); setError(null);
          if (!manualId && !initial) setId(sourceIdFromName(nextName) || fallbackId);
        }} /></label>
        <label>{copy.id}<input required maxLength={80} disabled={!!initial} value={id} onChange={(event) => {
          setManualId(true); setId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setError(null);
        }} /><small>{copy.idHint}</small></label>
        <label>{copy.url}<input required type="url" inputMode="url" value={baseUrl}
          placeholder="https://example.com/api.php/provide/vod/" onChange={(event) => { setBaseUrl(event.target.value); setError(null); }} /></label>
        {error && <p className="form-error" role="alert">{copy.errors[error]}</p>}
        <div className="source-modal-actions">{!initial && onImport && <button type="button" className="source-modal-import" onClick={onImport}>
          <Icon source={FileUp} size={16} />{copy.import}</button>}<button type="button" onClick={onClose}>{copy.cancel}</button>
          <button type="submit" className="primary-button">{initial ? copy.save : copy.add}</button></div>
      </form>
    </section></>;
}
