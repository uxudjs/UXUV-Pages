"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Settings, Tv } from "lucide-react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { useLocale } from "@/components/LocaleProvider";
import { IPTVChannelBrowser } from "@/components/iptv/IPTVChannelBrowser";
import { IPTVPlayer } from "@/components/iptv/IPTVPlayer";
import { IPTVSourceManager } from "@/components/iptv/IPTVSourceManager";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useSync } from "@/components/SyncProvider";
import { parseIptvSources, type IptvChannel, type IptvSource } from "@/lib/iptv/playlist";
import { loadIptvSources, type IptvSourceResult } from "@/lib/iptv/source-loader";
import { useAuth, type AuthSession } from "@/lib/store/auth-store";
import { Icon } from "@/components/ui/Icon";

const COPY = {
  "zh-CN": { title: "IPTV 直播", protected: "受保护的直播频道", denied: "无权访问 IPTV", deniedHint: "请联系管理员开通 IPTV 权限。",
    disabled: "当前部署已禁用 IPTV", disabledHint: "管理员尚未启用直播能力。", manage: "管理源", closeManage: "收起管理", refresh: "刷新全部",
    close: "关闭播放", noSources: "还没有直播源", noSourcesManage: "添加一个 M3U、M3U8 或 JSON 播放列表开始使用。", noSourcesAdmin: "管理员尚未配置可用直播源。",
    sources: "来源", groups: "分类", channels: "频道", allGroups: "全部分类", search: "搜索频道", loadMore: "加载更多", remaining: "个剩余", noMatch: "没有匹配的频道。",
    loading: "加载中", cached: "缓存", empty: "无频道", error: "加载失败", count: "个频道",
    sourceManager: { title: "自定义直播源", synced: "跨设备同步", add: "添加源", edit: "编辑", remove: "删除", save: "保存", cancel: "取消", name: "名称", url: "M3U / M3U8 / JSON URL", userAgent: "User-Agent（可选）", referer: "Referer（可选）", invalid: "请输入有效的 HTTP(S) 播放列表与 Referer 地址。", noCustom: "暂无自定义直播源。" } },
  "zh-TW": { title: "IPTV 直播", protected: "受保護的直播頻道", denied: "無權存取 IPTV", deniedHint: "請聯絡管理員開通 IPTV 權限。",
    disabled: "目前部署已停用 IPTV", disabledHint: "管理員尚未啟用直播功能。", manage: "管理來源", closeManage: "收合管理", refresh: "全部重新整理",
    close: "關閉播放", noSources: "尚無直播來源", noSourcesManage: "新增 M3U、M3U8 或 JSON 播放清單以開始使用。", noSourcesAdmin: "管理員尚未設定可用直播來源。",
    sources: "來源", groups: "分類", channels: "頻道", allGroups: "全部分類", search: "搜尋頻道", loadMore: "載入更多", remaining: "個剩餘", noMatch: "找不到符合的頻道。",
    loading: "載入中", cached: "快取", empty: "無頻道", error: "載入失敗", count: "個頻道",
    sourceManager: { title: "自訂直播來源", synced: "跨裝置同步", add: "新增來源", edit: "編輯", remove: "刪除", save: "儲存", cancel: "取消", name: "名稱", url: "M3U / M3U8 / JSON URL", userAgent: "User-Agent（選填）", referer: "Referer（選填）", invalid: "請輸入有效的 HTTP(S) 播放清單與 Referer 位址。", noCustom: "尚無自訂直播來源。" } },
  en: { title: "Live TV", protected: "Protected live channels", denied: "IPTV access denied", deniedHint: "Ask an administrator to grant IPTV access.",
    disabled: "IPTV is disabled", disabledHint: "An administrator has not enabled live TV for this deployment.", manage: "Manage sources", closeManage: "Close manager", refresh: "Refresh all",
    close: "Close player", noSources: "No live sources", noSourcesManage: "Add an M3U, M3U8, or JSON playlist to begin.", noSourcesAdmin: "No live source is configured by an administrator.",
    sources: "Sources", groups: "Categories", channels: "Channels", allGroups: "All categories", search: "Search channels", loadMore: "Load more", remaining: "remaining", noMatch: "No matching channels.",
    loading: "Loading", cached: "Cached", empty: "No channels", error: "Load failed", count: "channels",
    sourceManager: { title: "Custom live sources", synced: "Synced across devices", add: "Add source", edit: "Edit", remove: "Remove", save: "Save", cancel: "Cancel", name: "Name", url: "M3U / M3U8 / JSON URL", userAgent: "User-Agent (optional)", referer: "Referer (optional)", invalid: "Enter valid HTTP(S) playlist and Referer addresses.", noCustom: "No custom live sources." } },
} as const;

function hasPermission(session: AuthSession | undefined, permission: "iptv_access" | "iptv_source_management" | "iptv_builtin_sources") {
  if (!session) return false;
  if (session.role === "super_admin" || session.role === "admin") return true;
  if (session.customPermissions.includes(permission)) return true;
  return permission === "iptv_source_management" && session.customPermissions.includes("iptv_access");
}

function storedSources(sources: IptvSource[]) {
  return sources.map(({ id, name, url, userAgent, referer }) => ({ id, name, url, ...(userAgent ? { userAgent } : {}), ...(referer ? { referer } : {}) }));
}

export function IptvExperience() {
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { config } = useRuntimeConfig();
  const { documents, updateConfigField } = useSync();
  const session = auth?.session;
  const canAccess = hasPermission(session, "iptv_access");
  const canManage = hasPermission(session, "iptv_source_management");
  const canUseBuiltin = hasPermission(session, "iptv_builtin_sources");
  const customValue = "fields" in documents.config.payload ? documents.config.payload.fields.iptvSources?.value : undefined;
  const customSources = useMemo(() => parseIptvSources(JSON.stringify(Array.isArray(customValue) ? customValue : []), "custom"), [customValue]);
  const builtinSources = useMemo(() => canUseBuiltin ? parseIptvSources(config.sources?.iptvSources || "") : [], [canUseBuiltin, config.sources?.iptvSources]);
  const sources = useMemo(() => [...builtinSources, ...customSources], [builtinSources, customSources]);
  const [results, setResults] = useState<IptvSourceResult[]>([]);
  const [activeChannel, setActiveChannel] = useState<IptvChannel | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!canAccess || !config.capabilities.iptv || sources.length === 0) { queueMicrotask(() => setResults([])); return; }
    const controller = new AbortController();
    queueMicrotask(() => setResults(sources.map((source) => ({ source, channels: [], groups: [], state: "loading", cached: false }))));
    void loadIptvSources(sources, { signal: controller.signal, force: refresh > 0, onResult: (result) => {
      if (controller.signal.aborted) return;
      setResults((current) => current.map((item) => item.source.id === result.source.id ? result : item));
    } }).then((loaded) => {
      if (controller.signal.aborted) return;
      setResults(loaded);
      if (loaded.some(({ status }) => status === 401)) auth?.markSessionExpired();
    }).catch((error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) setResults([]); });
    return () => controller.abort();
  }, [auth, canAccess, config.capabilities.iptv, refresh, sources]);

  const totalChannels = results.reduce((total, result) => total + result.channels.length, 0);
  if (!canAccess) return <div className="content-shell"><ContentNavigation /><main className="content-main">
    <section className="empty-collection" role="alert"><h1>{copy.denied}</h1><p>{copy.deniedHint}</p></section></main></div>;
  if (!config.capabilities.iptv) return <div className="content-shell"><ContentNavigation /><main className="content-main">
    <section className="empty-collection" role="alert"><h1>{copy.disabled}</h1><p>{copy.disabledHint}</p></section></main></div>;
  if (sources.length === 0) return <div className="iptv-legacy-page"><main className="iptv-legacy-container">
    <header className="iptv-legacy-header"><div className="iptv-legacy-heading">
      <Link href="/" prefetch={false} aria-label="返回首页" data-focusable><Icon source={ChevronLeft} size={20} /></Link>
      <div><h1><Icon source={Tv} size={24} />直播</h1><p>IPTV 直播频道</p></div>
    </div>{canManage && <button type="button" data-focusable aria-expanded={managerOpen}
      onClick={() => setManagerOpen((value) => !value)}><Icon source={Settings} size={16} />{copy.manage}</button>}</header>
    {managerOpen && canManage && <div className="iptv-legacy-manager"><IPTVSourceManager sources={customSources} labels={copy.sourceManager}
      onChange={(next) => updateConfigField("iptvSources", storedSources(next))} /></div>}
    <section className="iptv-legacy-empty"><Icon source={Tv} size={48} /><p>暂无频道</p><small>请先添加 M3U 直播源</small></section>
  </main></div>;

  return <div className="content-shell"><ContentNavigation /><main className="content-main iptv-main">
    <header className="collection-header iptv-header"><div><p className="public-kicker">LIVE TELEVISION</p><h1>{copy.title}</h1>
      <p>{totalChannels > 0 ? `${totalChannels} ${copy.count}` : copy.protected}</p></div><div className="iptv-header-actions">
      <button type="button" data-focusable disabled={sources.length === 0} onClick={() => setRefresh((value) => value + 1)}>{copy.refresh}</button>
      {canManage && <button type="button" data-focusable aria-expanded={managerOpen} onClick={() => setManagerOpen((value) => !value)}>
        {managerOpen ? copy.closeManage : copy.manage}</button>}</div></header>
    {managerOpen && canManage && <IPTVSourceManager sources={customSources} labels={copy.sourceManager}
      onChange={(next) => updateConfigField("iptvSources", storedSources(next))} />}
    {activeChannel && <section className="iptv-active" aria-labelledby="active-channel-title"><div className="section-title">
      <h2 id="active-channel-title">{activeChannel.name}</h2><button type="button" data-focusable onClick={() => setActiveChannel(null)}>{copy.close}</button></div>
      <IPTVPlayer key={activeChannel.id} channel={activeChannel} onClose={() => setActiveChannel(null)} /></section>}
    {sources.length === 0 ? <section className="empty-collection"><h2>{copy.noSources}</h2>
      <p>{canManage ? copy.noSourcesManage : copy.noSourcesAdmin}</p></section>
      : <IPTVChannelBrowser sources={sources} results={results} activeChannel={activeChannel} labels={copy}
        onSelect={setActiveChannel} />}
  </main></div>;
}
