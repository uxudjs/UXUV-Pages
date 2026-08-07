"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import { ContentApiError } from "@/lib/content/api-client";
import { loadIptvPlaylist, parseIptvSources, type IptvChannel, type IptvSource } from "@/lib/media/media-client";
import { useAuth, type AuthSession } from "@/lib/store/auth-store";

function hasPermission(session: AuthSession | undefined, permission: "iptv_access" | "iptv_source_management" | "iptv_builtin_sources") {
  if (!session) return false;
  if (session.role === "super_admin" || session.role === "admin") return true;
  if (session.customPermissions.includes(permission)) return true;
  return permission === "iptv_source_management" && session.customPermissions.includes("iptv_access");
}

function playlistFailure(error: unknown): string {
  if (!(error instanceof ContentApiError)) return error instanceof Error ? error.message : "无法加载频道列表。";
  if (error.status === 401) return "登录会话已失效，请重新登录。";
  if (error.code === "IPTV_ACCESS_REQUIRED" || error.status === 403) return "当前账户没有 IPTV 权限。";
  if (error.status === 429) return "频道请求过于频繁，请稍后重试。";
  if (error.status >= 500) return "IPTV 上游暂时不可用，请稍后重试。";
  return error.message;
}

function customSourceValue(value: unknown): IptvSource[] {
  return parseIptvSources(JSON.stringify(Array.isArray(value) ? value : []), "custom");
}

export function IptvExperience() {
  const auth = useAuth();
  const { config } = useRuntimeConfig();
  const { documents, updateConfigField } = useSync();
  const session = auth?.session;
  const canAccess = hasPermission(session, "iptv_access");
  const canManage = hasPermission(session, "iptv_source_management");
  const canUseBuiltin = hasPermission(session, "iptv_builtin_sources");
  const customValue = "fields" in documents.config.payload ? documents.config.payload.fields.iptvSources?.value : undefined;
  const customSources = useMemo(() => customSourceValue(customValue), [customValue]);
  const builtinSources = useMemo(
    () => canUseBuiltin ? parseIptvSources(config.sources?.iptvSources || "") : [],
    [canUseBuiltin, config.sources?.iptvSources],
  );
  const sources = useMemo(() => [...builtinSources, ...customSources], [builtinSources, customSources]);
  const [sourceId, setSourceId] = useState("");
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<IptvChannel | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [formError, setFormError] = useState("");
  const selectedSource = sources.find(({ id }) => id === sourceId) ?? sources[0];

  useEffect(() => {
    if (!sourceId && sources[0]) queueMicrotask(() => setSourceId(sources[0].id));
  }, [sourceId, sources]);

  useEffect(() => {
    if (!canAccess || !selectedSource) {
      queueMicrotask(() => {
        setChannels([]);
        setState("idle");
      });
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setState("loading");
        setMessage("");
        setActiveChannel(null);
      }
    });
    void loadIptvPlaylist(selectedSource, controller.signal).then((items) => {
      setChannels(items);
      setState(items.length > 0 ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setMessage(playlistFailure(error));
      setState("error");
    });
    return () => controller.abort();
  }, [attempt, auth, canAccess, selectedSource]);

  const groups = useMemo(() => [...new Set(channels.map((channel) => channel.group))].sort(), [channels]);
  const visibleChannels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return channels.filter((channel) => (!group || channel.group === group)
      && (!normalized || channel.name.toLowerCase().includes(normalized)));
  }, [channels, group, query]);

  const addSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let normalized: string;
    try {
      const url = new URL(sourceUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      normalized = url.href;
    } catch {
      setFormError("请输入有效的 HTTP(S) 播放列表地址。");
      return;
    }
    const next = [...customSources.map(({ name, url }) => ({ name, url })), {
      name: sourceName.trim() || `自定义源 ${customSources.length + 1}`,
      url: normalized,
    }];
    updateConfigField("iptvSources", next);
    setSourceName("");
    setSourceUrl("");
    setFormError("");
  };

  const removeSource = (target: IptvSource) => {
    updateConfigField("iptvSources", customSources.filter(({ url }) => url !== target.url).map(({ name, url }) => ({ name, url })));
    if (selectedSource?.url === target.url) setSourceId("");
  };

  if (!canAccess) return (
    <div className="content-shell"><ContentNavigation /><main className="content-main">
      <section className="empty-collection" role="alert"><h1>无权访问 IPTV</h1><p>请联系管理员开通 IPTV 权限。</p></section>
    </main></div>
  );

  return (
    <div className="content-shell">
      <ContentNavigation />
      <main className="content-main iptv-main">
        <header className="collection-header iptv-header">
          <div><p className="public-kicker">LIVE TELEVISION</p><h1>IPTV 直播</h1><p>{channels.length > 0 ? `${channels.length} 个频道` : "受保护的直播频道"}</p></div>
          {sources.length > 0 && <label>直播源<select value={selectedSource?.id || ""} onChange={(event) => { setSourceId(event.target.value); setGroup(""); }}>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select></label>}
        </header>

        {canManage && (
          <section className="player-panel iptv-source-manager" aria-labelledby="iptv-source-title">
            <div className="section-title"><h2 id="iptv-source-title">自定义直播源</h2><span>跨设备同步</span></div>
            <form onSubmit={addSource}>
              <label>名称<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} maxLength={80} /></label>
              <label>播放列表 URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} inputMode="url" required /></label>
              <button className="primary-button" type="submit">添加源</button>
            </form>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            {customSources.length > 0 && <ul>{customSources.map((source) => <li key={source.url}><span>{source.name}</span><button type="button" onClick={() => removeSource(source)}>删除</button></li>)}</ul>}
          </section>
        )}

        {activeChannel && (
          <section className="iptv-active" aria-labelledby="active-channel-title">
            <div className="section-title"><h2 id="active-channel-title">{activeChannel.name}</h2><button type="button" onClick={() => setActiveChannel(null)}>关闭播放</button></div>
            <MediaPlayer key={activeChannel.id} target={activeChannel.url} route="iptv-stream" title={activeChannel.name} userAgent={activeChannel.userAgent} referer={activeChannel.referer} />
          </section>
        )}

        {sources.length === 0 && <section className="empty-collection"><h2>还没有直播源</h2><p>{canManage ? "添加一个 M3U 或 M3U8 播放列表开始使用。" : "管理员尚未配置可用直播源。"}</p></section>}
        {state === "loading" && <p className="content-message" role="status">正在加载频道列表…</p>}
        {state === "error" && <section className="empty-collection" role="alert"><h2>频道加载失败</h2><p>{message}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button></section>}
        {state === "empty" && <section className="empty-collection"><h2>没有可用频道</h2><p>该播放列表为空或未包含有效 HTTP(S) 频道。</p></section>}
        {state === "ready" && (
          <section className="content-section" aria-labelledby="channel-title">
            <div className="section-title"><h2 id="channel-title">频道</h2><span>{visibleChannels.length} 个</span></div>
            <div className="iptv-filters"><label>搜索频道<input value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>频道分组<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">全部分组</option>{groups.map((name) => <option key={name}>{name}</option>)}</select></label></div>
            {visibleChannels.length > 0 ? <div className="channel-grid">{visibleChannels.map((channel) => <button key={channel.id} type="button" aria-pressed={activeChannel?.id === channel.id} onClick={() => setActiveChannel(channel)}><span aria-hidden="true">{channel.name.slice(0, 1)}</span><strong>{channel.name}</strong><small>{channel.group}</small></button>)}</div> : <p className="content-message" role="status">没有匹配的频道。</p>}
          </section>
        )}
      </main>
    </div>
  );
}
