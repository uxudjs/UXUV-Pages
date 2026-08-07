"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { VideoSource } from "@/lib/content/types";
import type { ConfigPayload, TimestampedRecord } from "@/lib/sync/document-types";

function isManagedSource(value: TimestampedRecord): value is VideoSource {
  return typeof value.name === "string"
    && typeof value.baseUrl === "string"
    && value.group !== "premium";
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function SourceSettings() {
  const { documents, upsertRecord, removeRecord } = useSync();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");
  const sources = useMemo(() => {
    const config = documents.config.payload as ConfigPayload;
    return config.sources.filter(isManagedSource);
  }, [documents.config.payload]);

  const addSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedUrl) {
      setError("请输入有效的 HTTP 或 HTTPS 地址。");
      return;
    }
    const now = Date.now();
    upsertRecord("config", "sources", {
      id: `source-${crypto.randomUUID()}`,
      updatedAt: now,
      name: name.trim(),
      baseUrl: normalizedUrl,
      searchPath: "/api.php/provide/vod/",
      detailPath: "/api.php/provide/vod/",
      enabled: true,
      group: "normal",
    });
    setName("");
    setBaseUrl("");
    setError("");
  };

  return (
    <section className="settings-section source-settings" aria-labelledby="source-settings-title">
      <div className="section-heading">
        <div><p className="public-kicker">个人内容</p><h2 id="source-settings-title">视频源</h2></div>
        <span>{sources.length} 个来源</span>
      </div>
      {sources.length === 0 ? <p>尚未配置视频源。添加后即可在首页搜索。</p> : (
        <ul className="source-list">{sources.map((source) => (
          <li className="source-row" key={source.id}>
            <div><strong>{source.name}</strong><span>{source.baseUrl}</span></div>
            <button type="button" aria-pressed={source.enabled !== false} onClick={() => upsertRecord("config", "sources", {
              ...source, enabled: source.enabled === false, updatedAt: Date.now(),
            })}>{source.enabled === false ? "启用" : "停用"}</button>
            <button className="danger-button" type="button" onClick={() => removeRecord("config", "sources", source.id)}>删除</button>
          </li>
        ))}</ul>
      )}
      <form className="source-form" onSubmit={addSource}>
        <label>来源名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>基础 URL<input required type="url" inputMode="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit">添加视频源</button>
      </form>
    </section>
  );
}
