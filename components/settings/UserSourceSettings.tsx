"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import type { VideoSource } from "@/lib/content/types";
import type { ConfigPayload } from "@/lib/sync/document-types";

const COPY = {
  "zh-CN": { title: "个人视频源", description: "添加你自己的视频源，不影响其他用户。", name: "源名称", url: "接口地址 (https://...)", add: "添加", empty: "还没有个人视频源，添加一个试试吧。", required: "名称和接口地址不能为空。", invalid: "请输入有效的 HTTP 或 HTTPS URL。", toggle: "切换启用状态", remove: "删除" },
  "zh-TW": { title: "個人影片來源", description: "新增你自己的影片來源，不影響其他使用者。", name: "來源名稱", url: "介面位址 (https://…)", add: "新增", empty: "尚無個人影片來源，新增一個試試吧。", required: "名稱與介面位址不可為空。", invalid: "請輸入有效的 HTTP 或 HTTPS URL。", toggle: "切換啟用狀態", remove: "刪除" },
  en: { title: "Personal video sources", description: "Add your own video sources without affecting other users.", name: "Source name", url: "Endpoint (https://…)", add: "Add", empty: "No personal video sources yet.", required: "Name and endpoint are required.", invalid: "Enter a valid HTTP or HTTPS URL.", toggle: "Toggle source", remove: "Remove" },
} as const;

function isPersonalSource(value: unknown): value is VideoSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<VideoSource>;
  return source.kind === "personal" && source.group !== "premium" && typeof source.id === "string"
    && typeof source.name === "string" && typeof source.baseUrl === "string";
}

export function UserSourceSettings() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { documents, upsertRecord, removeRecord } = useSync();
  const sources = useMemo(() => (documents.config.payload as ConfigPayload).sources.filter(isPersonalSource), [documents.config.payload]);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !baseUrl.trim()) { setError(copy.required); return; }
    let url: URL;
    try { url = new URL(baseUrl.trim()); } catch { setError(copy.invalid); return; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) { setError(copy.invalid); return; }
    const now = Date.now();
    const id = `user-${now.toString(36)}`;
    upsertRecord("config", "sources", { id, updatedAt: now, name: name.trim().slice(0, 80), baseUrl: url.href, enabled: true, kind: "personal", group: "normal" });
    setName(""); setBaseUrl(""); setError("");
  };

  return <SettingsSection id="personal-sources" title={copy.title} description={copy.description}>
    <form className="personal-source-form" onSubmit={add}>
      <input value={name} maxLength={80} placeholder={copy.name} onChange={(event) => { setName(event.target.value); setError(""); }} />
      <input value={baseUrl} maxLength={2048} placeholder={copy.url} onChange={(event) => { setBaseUrl(event.target.value); setError(""); }} />
      <button className="primary-button" type="submit"><Icon source={Plus} size={14} />{copy.add}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sources.length === 0 ? <p className="personal-source-empty">{copy.empty}</p> : <ul className="personal-source-list">
      {sources.map((source) => <li key={source.id}><button type="button" aria-label={`${copy.toggle} ${source.name}`} aria-pressed={source.enabled !== false}
        onClick={() => upsertRecord("config", "sources", { ...source, enabled: source.enabled === false, updatedAt: Date.now() })}><span /></button>
        <div><strong>{source.name}</strong><small>{source.baseUrl}</small></div><button className="danger-button" type="button" aria-label={`${copy.remove} ${source.name}`}
          onClick={() => removeRecord("config", "sources", source.id)}><Icon source={Trash2} size={14} /></button></li>)}
    </ul>}
  </SettingsSection>;
}
