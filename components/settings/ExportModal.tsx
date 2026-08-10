"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";

const focusable = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
const COPY = {
  "zh-CN": { title: "导出完整设置数据", close: "关闭导出对话框", search: "包含搜索记录", watch: "包含观看记录", preview: "导出预览", bytes: "文件大小", safe: "导出当前账户的普通与 Premium 配置、片源、收藏和所选记录，不包含密码、Cookie 或密钥。", cancel: "取消", download: "下载 JSON", error: "数据包含不安全或无效内容，已停止导出。" },
  "zh-TW": { title: "匯出完整設定資料", close: "關閉匯出對話框", search: "包含搜尋記錄", watch: "包含觀看記錄", preview: "匯出預覽", bytes: "檔案大小", safe: "匯出目前帳戶的一般與 Premium 設定、來源、收藏和所選記錄，不包含密碼、Cookie 或金鑰。", cancel: "取消", download: "下載 JSON", error: "資料包含不安全或無效內容，已停止匯出。" },
  en: { title: "Export all settings data", close: "Close export dialog", search: "Include search history", watch: "Include watch history", preview: "Export preview", bytes: "File size", safe: "Exports this account's standard and Premium settings, sources, favorites, and selected histories. Passwords, cookies, and secrets are never included.", cancel: "Cancel", download: "Download JSON", error: "Export stopped because the data is unsafe or invalid." },
} as const;

export function ExportModal({ onClose, onBuild }: Readonly<{ onClose: () => void; onBuild: (options: { includeSearchHistory: boolean; includeWatchHistory: boolean }) => string }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const dialogRef = useRef<HTMLElement>(null);
  const [includeSearchHistory, setIncludeSearchHistory] = useState(true);
  const [includeWatchHistory, setIncludeWatchHistory] = useState(true);
  let text = "";
  let invalid = false;
  try { text = onBuild({ includeSearchHistory, includeWatchHistory }); } catch { invalid = true; }

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)].filter((element) => element.offsetParent !== null);
      if (!elements.length) return;
      const first = elements[0]; const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);

  const download = () => {
    if (!text || invalid) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "uxuv-settings-all.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <><button type="button" className="source-modal-backdrop" aria-label={copy.close} onClick={onClose} />
    <section ref={dialogRef} className="source-modal data-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="settings-export-title">
      <header><h2 id="settings-export-title">{copy.title}</h2><button type="button" aria-label={copy.close} onClick={onClose}>×</button></header>
      <div className="data-transfer-options">
        <label><input type="checkbox" checked={includeSearchHistory} data-autofocus onChange={(event) => setIncludeSearchHistory(event.target.checked)} />{copy.search}</label>
        <label><input type="checkbox" checked={includeWatchHistory} onChange={(event) => setIncludeWatchHistory(event.target.checked)} />{copy.watch}</label>
      </div>
      <div className="data-transfer-preview" aria-labelledby="settings-export-preview"><h3 id="settings-export-preview">{copy.preview}</h3>
        <p>{copy.bytes}: <strong>{new TextEncoder().encode(text).byteLength.toLocaleString()}</strong></p><p>{copy.safe}</p></div>
      {invalid && <p className="form-error" role="alert">{copy.error}</p>}
      <div className="source-modal-actions"><button type="button" onClick={onClose}>{copy.cancel}</button>
        <button type="button" className="primary-button" disabled={invalid} onClick={download}>{copy.download}</button></div>
    </section></>;
}
