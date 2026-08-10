"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { MAX_SETTINGS_IMPORT_BYTES, previewSettingsImport, SettingsTransferError, type SettingsImportPreview } from "@/lib/data/settings-transfer";

const focusable = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const COPY = {
  "zh-CN": { title: "导入完整设置数据", close: "关闭导入对话框", paste: "粘贴 JSON", file: "或选择 JSON 文件", empty: "尚未选择文件", preview: "验证并预览", summary: "导入预览", config: "配置项", sources: "片源", subscriptions: "订阅", history: "观看记录", favorites: "收藏", cancel: "取消", confirm: "确认导入", applied: "导入已保存并等待同步。", errors: { empty: "请输入或选择 JSON 文件。", size: "文件超过 1 MiB 上限。", json: "JSON 格式无效。", schema: "文件不是受支持的 UXUVideo 设置导出。", premium: "不能单独导入 Premium 模式数据。", sensitive: "检测到密码、Cookie、密钥或敏感 URL，已拒绝整个导入。", invalid: "导入数据不符合安全边界。", apply: "无法完整保存导入数据，原有数据已保留。" } },
  "zh-TW": { title: "匯入完整設定資料", close: "關閉匯入對話框", paste: "貼上 JSON", file: "或選擇 JSON 檔案", empty: "尚未選擇檔案", preview: "驗證並預覽", summary: "匯入預覽", config: "設定項", sources: "來源", subscriptions: "訂閱", history: "觀看記錄", favorites: "收藏", cancel: "取消", confirm: "確認匯入", applied: "匯入已儲存並等待同步。", errors: { empty: "請輸入或選擇 JSON 檔案。", size: "檔案超過 1 MiB 上限。", json: "JSON 格式無效。", schema: "檔案不是支援的 UXUVideo 設定匯出。", premium: "不能單獨匯入 Premium 模式資料。", sensitive: "偵測到密碼、Cookie、金鑰或敏感 URL，已拒絕整個匯入。", invalid: "匯入資料不符合安全邊界。", apply: "無法完整儲存匯入資料，原有資料已保留。" } },
  en: { title: "Import all settings data", close: "Close import dialog", paste: "Paste JSON", file: "Or choose a JSON file", empty: "No file selected", preview: "Validate and preview", summary: "Import preview", config: "Config fields", sources: "Sources", subscriptions: "Subscriptions", history: "Watch history", favorites: "Favorites", cancel: "Cancel", confirm: "Confirm import", applied: "Import saved and waiting to sync.", errors: { empty: "Paste JSON or choose a file.", size: "The file exceeds the 1 MiB limit.", json: "The JSON is invalid.", schema: "This is not a supported UXUVideo settings export.", premium: "Premium-mode data cannot be imported by itself.", sensitive: "The import contains a password, cookie, secret, or sensitive URL, so the entire import was rejected.", invalid: "The import does not meet the safety boundary.", apply: "The import could not be saved completely; existing data was preserved." } },
} as const;

type ErrorCode = SettingsTransferError["code"] | "apply";

export function SettingsImportModal({ onClose, onImport }: Readonly<{ onClose: () => void; onImport: (preview: SettingsImportPreview) => void }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SettingsImportPreview | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)].filter((element) => element.offsetParent !== null);
      if (!elements.length) return;
      const first = elements[0]; const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);

  const validate = () => {
    setApplied(false);
    try { setPreview(previewSettingsImport(text)); setError(null); }
    catch (nextError) { setPreview(null); setError(nextError instanceof SettingsTransferError ? nextError.code : "invalid"); }
  };
  const confirm = () => {
    if (!preview) return;
    try { onImport(preview); setApplied(true); setError(null); setPreview(null); }
    catch { setApplied(false); setError("apply"); }
  };

  return <><button type="button" className="source-modal-backdrop" aria-label={copy.close} onClick={onClose} />
    <section ref={dialogRef} className="source-modal import-modal data-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="settings-import-title">
      <header><h2 id="settings-import-title">{copy.title}</h2><button type="button" aria-label={copy.close} onClick={onClose}>×</button></header>
      <div className="import-panel"><label>{copy.paste}<textarea rows={10} data-autofocus value={text} onChange={(event) => { setText(event.target.value); setPreview(null); setError(null); }} /></label>
        <label>{copy.file}<input type="file" accept="application/json,.json" onChange={(event) => {
          const file = event.target.files?.[0]; setFileName(file?.name ?? ""); setPreview(null); setApplied(false);
          if (!file) return;
          if (file.size > MAX_SETTINGS_IMPORT_BYTES) { setError("size"); return; }
          void file.text().then((value) => { setText(value); setError(null); }).catch(() => setError("json"));
        }} /></label><small>{fileName || copy.empty}</small>
        <button type="button" className="primary-button" onClick={validate}>{copy.preview}</button></div>
      {error && <p className="form-error" role="alert">{copy.errors[error]}</p>}
      {applied && <p className="import-status" role="status">{copy.applied}</p>}
      {preview && <section className="data-transfer-preview" aria-labelledby="settings-import-preview"><h3 id="settings-import-preview">{copy.summary}</h3><dl>
        <div><dt>{copy.config}</dt><dd>{preview.summary.fields}</dd></div><div><dt>{copy.sources}</dt><dd>{preview.summary.sources}</dd></div>
        <div><dt>{copy.subscriptions}</dt><dd>{preview.summary.subscriptions}</dd></div><div><dt>{copy.history}</dt><dd>{preview.summary.history}</dd></div>
        <div><dt>{copy.favorites}</dt><dd>{preview.summary.favorites}</dd></div></dl></section>}
      <div className="source-modal-actions"><button type="button" onClick={onClose}>{copy.cancel}</button>
        <button type="button" className="primary-button" disabled={!preview} onClick={confirm}>{copy.confirm}</button></div>
    </section></>;
}
