"use client";

import { useSync } from "@/components/SyncProvider";
import type { ConfigPayload } from "@/lib/sync/document-types";

const locales = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
];

export function SyncSettings() {
  const sync = useSync();
  const config = sync.documents.config.payload as ConfigPayload;
  const localeValue = config.fields.locale?.value;
  const locale = typeof localeValue === "string" ? localeValue : "zh-CN";

  return (
    <section className="settings-section sync-settings" aria-labelledby="sync-settings-title">
      <div className="section-heading">
        <div>
          <h2 id="sync-settings-title">同步与离线</h2>
          <p>更改会先立即保存在此设备，再通过你的 Worker 与其他设备合并。</p>
        </div>
        <span className="sync-dirty-state" data-sync-dirty={sync.documents.config.dirty}>
          {sync.documents.config.dirty ? "有未同步更改" : "云端版本已确认"}
        </span>
      </div>
      <label className="field-label" htmlFor="sync-locale">界面语言</label>
      <select id="sync-locale" value={locale} onChange={(event) => sync.updateConfigField("locale", event.target.value)}>
        {locales.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>
    </section>
  );
}
