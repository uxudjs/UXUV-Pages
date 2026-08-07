"use client";

import { FormEvent, useMemo, useState } from "react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { useSync } from "@/components/SyncProvider";
import { isVideoSource } from "@/lib/content/types";

export function PremiumSettingsExperience() {
  const { documents, upsertRecord, removeRecord } = useSync();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const sources = useMemo(() => "sources" in documents.config.payload
    ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) => group === "premium") : [],
  [documents.config.payload]);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const now = Date.now();
    upsertRecord("config", "sources", {
      id: `premium-${crypto.randomUUID()}`, updatedAt: now, name: name.trim(),
      baseUrl: baseUrl.trim(), searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/",
      enabled: true, group: "premium",
    });
    setName(""); setBaseUrl("");
  };

  return <div className="content-shell"><ContentNavigation premium /><main className="content-main">
    <header className="collection-header"><div><p className="public-kicker">PREMIUM SETTINGS</p><h1>Premium 来源</h1>
      <p>来源按账户同步；访问权限仍只由 Worker 会话判定。</p></div></header>
    <section className="settings-section premium-source-settings"><h2>已配置来源</h2>
      {sources.length === 0 ? <p>尚未配置 Premium 来源。</p> : <ul>{sources.map((source) => <li key={source.id}>
        <div><strong>{source.name}</strong><span>{source.baseUrl}</span></div>
        <button type="button" aria-pressed={source.enabled !== false} onClick={() => upsertRecord("config", "sources", { ...source, enabled: source.enabled === false, updatedAt: Date.now() })}>{source.enabled === false ? "启用" : "停用"}</button>
        <button className="danger-button" type="button" onClick={() => removeRecord("config", "sources", source.id)}>删除</button>
      </li>)}</ul>}
      <form className="account-form" onSubmit={add}><h3>添加来源</h3>
        <label>名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>基础 URL<input required type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <button className="primary-button" type="submit">添加 Premium 来源</button>
      </form>
    </section>
  </main></div>;
}
