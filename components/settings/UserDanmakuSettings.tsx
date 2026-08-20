"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Icon } from "@/components/ui/Icon";
import { useSync } from "@/components/SyncProvider";
import { normalizeDanmakuApis, unsafeDanmakuUrlReason } from "@/lib/player/player-settings";
import type { ConfigPayload } from "@/lib/sync/document-types";

const COPY = {
  "zh-CN": { title: "弹幕 API", description: "管理你的弹幕 API，选择当前使用的 API。", name: "API 名称", url: "API URL (https://...)", add: "添加",
    active: "设为优先", remove: "删除", required: "名称和 URL 不能为空。", emptyState: "尚未添加弹幕 API。添加并选择后才会启用弹幕。", invalid: "请输入有效的 HTTP 或 HTTPS URL。",
    credentials: "URL 不得包含用户名或密码。", secret: "URL 不得包含 Token、密钥或签名参数；请改为 Worker 服务端配置。", limit: "每个账户最多保存 10 个弹幕 API。", safety: "API 配置按账户保存；敏感凭据只能留在 Worker 服务端。" },
  "zh-TW": { title: "彈幕 API", description: "管理此帳戶的彈幕 API，並選擇優先使用項目。", name: "API 名稱", url: "API URL（https://…）", add: "新增",
    active: "設為優先", remove: "刪除", required: "名稱與 URL 不可空白。", emptyState: "尚未新增彈幕 API。新增並選擇後才會啟用彈幕。", invalid: "請輸入有效的 HTTP 或 HTTPS URL。",
    credentials: "URL 不可包含使用者名稱或密碼。", secret: "URL 不可包含 Token、金鑰或簽章參數；請改在 Worker 伺服器端設定。", limit: "每個帳戶最多儲存 10 個彈幕 API。", safety: "API 設定依帳戶儲存；敏感憑證只能留在 Worker 伺服器端。" },
  en: { title: "Danmaku APIs", description: "Manage this account's danmaku APIs and choose the preferred entry.", name: "API name", url: "API URL (https://…)", add: "Add",
    active: "Set as preferred", remove: "Remove", required: "Name and URL are required.", emptyState: "No danmaku APIs have been added. Add and select one to enable danmaku.", invalid: "Enter a valid HTTP or HTTPS URL.",
    credentials: "The URL must not contain a username or password.", secret: "The URL must not contain token, key, or signature parameters; configure those on the Worker instead.", limit: "Each account can store up to 10 danmaku APIs.", safety: "API settings are account-scoped; sensitive credentials must remain on the Worker." },
} as const;

export function UserDanmakuSettings({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const { locale } = useLocale();
  const sync = useSync();
  const copy = COPY[locale];
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const key = (value: string) => mode === "premium" ? `premium.${value}` : value;
  const apis = normalizeDanmakuApis(fields[key("danmakuApis")]?.value);
  const activeValue = fields[key("activeDanmakuApiId")]?.value;
  const selected = typeof activeValue === "string" && apis.some(({ id }) => id === activeValue) ? activeValue : null;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const save = (next: typeof apis) => sync.updateConfigField(key("danmakuApis"), next);
  const select = (id: string) => {
    if (!selected) sync.updateConfigField(key("danmakuEnabled"), false);
    sync.updateConfigField(key("activeDanmakuApiId"), id);
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !url.trim()) { setError(copy.required); return; }
    if (apis.length >= 10) { setError(copy.limit); return; }
    const reason = unsafeDanmakuUrlReason(url);
    if (reason) { setError(copy[reason === "required" ? "required" : reason]); return; }
    const id = `danmaku-${Date.now().toString(36)}`;
    save([...apis, { id, name: name.trim().slice(0, 40), url: url.trim() }]);
    setName(""); setUrl(""); setError("");
  };
  const remove = (id: string) => {
    save(apis.filter((api) => api.id !== id));
    if (selected === id) {
      sync.updateConfigField(key("activeDanmakuApiId"), null);
      sync.updateConfigField(key("danmakuEnabled"), false);
    }
  };

  return <SettingsSection id="danmaku-apis" title={copy.title} description={copy.description}>
    <div className="danmaku-api-settings"><form className="danmaku-api-form" onSubmit={add}>
      <label className="settings-field-row"><span>{copy.name}</span><input placeholder={copy.name} maxLength={40} value={name}
        onChange={(event) => { setName(event.target.value); setError(""); }} /></label>
      <label className="settings-field-row"><span>{copy.url}</span><input placeholder={copy.url} maxLength={2048} value={url}
        onChange={(event) => { setUrl(event.target.value); setError(""); }} /></label>
      <button className="primary-button" type="submit"><Icon source={Plus} size={14} />{copy.add}</button>
    </form>{error && <p className="form-error" role="alert">{error}</p>}
    <div className="danmaku-api-list">{apis.length === 0 && <p className="danmaku-api-empty" role="status">{copy.emptyState}</p>}{apis.map((api) => <div className="danmaku-api-row" key={api.id}><button type="button" aria-pressed={selected === api.id}
        aria-label={`${copy.active} ${api.name}`} onClick={() => select(api.id)}><strong>{api.name}</strong><small>{api.url}</small></button>
        <button type="button" className="danger-button" aria-label={`${copy.remove} ${api.name}`} onClick={() => remove(api.id)}>{copy.remove}</button></div>)}
    </div></div>
  </SettingsSection>;
}
