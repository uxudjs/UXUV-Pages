"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import type { IptvChannel } from "@/lib/iptv/playlist";
import { isHevcRoute, orderIptvRoutes, probeIptvRoutes, supportsHevcPlayback, visibleIptvRoutes } from "@/lib/iptv/playback-policy";

const COPY = {
  "zh-CN": { routes: "播放线路", route: "线路", showAll: "展开全部线路", collapse: "收起线路", probing: "正在测量线路延迟…",
    switched: "当前线路失败，已自动切换。", exhausted: "所有线路均不可用，请稍后重试。", hevcOnly: "这些线路仅提供 HEVC；当前浏览器可能无法解码。",
    play: "播放", pause: "暂停", mute: "静音", unmute: "取消静音", progress: "播放进度", volume: "音量", speed: "播放速度",
    seekBack: "后退 {seconds} 秒", seekForward: "前进 {seconds} 秒", pip: "画中画", pipUnavailable: "当前浏览器或设备不支持画中画",
    cast: "投放", castUnavailable: "未检测到可用的 Google Cast 能力", webFullscreen: "网页全屏", exitWebFullscreen: "退出网页全屏",
    systemFullscreen: "系统全屏", exitSystemFullscreen: "退出系统全屏", systemFullscreenUnavailable: "当前浏览器不支持系统全屏",
    adFilter: "广告过滤", adOff: "关闭", adKeyword: "关键词", adHeuristic: "启发式", adAggressive: "激进",
    connecting: "正在连接受保护直播…", buffering: "正在缓冲…", retryPlayback: "重试播放", tokenInvalid: "直播授权已过期，请重试。",
    iptvDenied: "当前账户没有 IPTV 播放权限。", rateLimited: "直播请求过于频繁，请稍后重试。", upstreamFailed: "直播线路暂时中断，请重试或切换线路。",
    playbackFailed: "直播播放失败，请重试或切换线路。", codecUnsupported: "当前浏览器不支持此 HEVC 直播；请选择 H.264 线路。",
    directMode: "仅直连", nativeMode: "原生解码", retryMode: "智能重试", relayMode: "始终中继" },
  "zh-TW": { routes: "播放線路", route: "線路", showAll: "展開全部線路", collapse: "收合線路", probing: "正在測量線路延遲…",
    switched: "目前線路失敗，已自動切換。", exhausted: "所有線路均無法使用，請稍後重試。", hevcOnly: "這些線路僅提供 HEVC；目前瀏覽器可能無法解碼。",
    play: "播放", pause: "暫停", mute: "靜音", unmute: "取消靜音", progress: "播放進度", volume: "音量", speed: "播放速度",
    seekBack: "後退 {seconds} 秒", seekForward: "前進 {seconds} 秒", pip: "子母畫面", pipUnavailable: "目前瀏覽器或裝置不支援子母畫面",
    cast: "投放", castUnavailable: "未偵測到可用的 Google Cast 能力", webFullscreen: "網頁全螢幕", exitWebFullscreen: "退出網頁全螢幕",
    systemFullscreen: "系統全螢幕", exitSystemFullscreen: "退出系統全螢幕", systemFullscreenUnavailable: "目前瀏覽器不支援系統全螢幕",
    adFilter: "廣告過濾", adOff: "關閉", adKeyword: "關鍵詞", adHeuristic: "啟發式", adAggressive: "積極",
    connecting: "正在連接受保護直播…", buffering: "正在緩衝…", retryPlayback: "重試播放", tokenInvalid: "直播授權已過期，請重試。",
    iptvDenied: "目前帳戶沒有 IPTV 播放權限。", rateLimited: "直播請求過於頻繁，請稍後重試。", upstreamFailed: "直播線路暫時中斷，請重試或切換線路。",
    playbackFailed: "直播播放失敗，請重試或切換線路。", codecUnsupported: "目前瀏覽器不支援此 HEVC 直播；請選擇 H.264 線路。",
    directMode: "僅直連", nativeMode: "原生解碼", retryMode: "智慧重試", relayMode: "始終中繼" },
  en: { routes: "Playback routes", route: "Route", showAll: "Show all routes", collapse: "Collapse routes", probing: "Measuring route latency…",
    switched: "The route failed and playback switched automatically.", exhausted: "No route is currently available. Try again later.", hevcOnly: "These routes provide HEVC only; this browser may not decode them.",
    play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", progress: "Playback progress", volume: "Volume", speed: "Playback speed",
    seekBack: "Back {seconds} seconds", seekForward: "Forward {seconds} seconds", pip: "Picture in picture", pipUnavailable: "Picture in picture is unavailable",
    cast: "Cast", castUnavailable: "Google Cast capability was not detected", webFullscreen: "Web fullscreen", exitWebFullscreen: "Exit web fullscreen",
    systemFullscreen: "System fullscreen", exitSystemFullscreen: "Exit system fullscreen", systemFullscreenUnavailable: "System fullscreen is unavailable",
    adFilter: "Ad filtering", adOff: "Off", adKeyword: "Keywords", adHeuristic: "Heuristic", adAggressive: "Aggressive",
    connecting: "Connecting to protected live TV…", buffering: "Buffering…", retryPlayback: "Retry playback", tokenInvalid: "Live TV authorization expired. Try again.",
    iptvDenied: "This account cannot play IPTV.", rateLimited: "Too many live TV requests. Try again shortly.", upstreamFailed: "The live route stopped. Retry or switch routes.",
    playbackFailed: "Live playback failed. Retry or switch routes.", codecUnsupported: "This browser cannot decode this HEVC route. Choose an H.264 route.",
    directMode: "Direct only", nativeMode: "Native decoding", retryMode: "Smart retry", relayMode: "Always relay" },
} as const;

export function IPTVPlayer({ channel, onClose }: Readonly<{ channel: IptvChannel; onClose: () => void }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const routes = useMemo(() => [...new Set(channel.routes || [channel.url])], [channel.routes, channel.url]);
  const [latencies, setLatencies] = useState<Map<string, number>>(new Map());
  const [activeRoute, setActiveRoute] = useState(routes[0]);
  const [expanded, setExpanded] = useState(false);
  const [probing, setProbing] = useState(routes.length > 1);
  const [notice, setNotice] = useState("");
  const supportsHevc = useMemo(() => typeof document !== "undefined" && supportsHevcPlayback(document.createElement("video")), []);
  const orderedRoutes = useMemo(() => orderIptvRoutes(routes, latencies, supportsHevc), [latencies, routes, supportsHevc]);
  const attemptedRoutes = useRef(new Set<string>());
  const userSelected = useRef(false);
  const readyStartedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    readyStartedAt.current = performance.now();
    if (routes.length <= 1) return () => controller.abort();
    void probeIptvRoutes(routes, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setLatencies(result);
      setProbing(false);
      const ordered = orderIptvRoutes(routes, result, supportsHevc);
      if (!userSelected.current && ordered[0]) {
        readyStartedAt.current = performance.now();
        setActiveRoute(ordered[0]);
      }
    }).catch(() => { if (!controller.signal.aborted) setProbing(false); });
    return () => controller.abort();
  }, [routes, supportsHevc]);

  const selectRoute = useCallback((route: string) => {
    userSelected.current = true;
    attemptedRoutes.current.clear();
    readyStartedAt.current = performance.now();
    setNotice("");
    setActiveRoute(route);
  }, []);
  const handleReady = useCallback(() => {
    const latency = Math.max(0, Math.round(performance.now() - readyStartedAt.current));
    setLatencies((current) => new Map(current).set(activeRoute, latency));
  }, [activeRoute]);
  const handleFailure = useCallback(() => {
    attemptedRoutes.current.add(activeRoute);
    const next = orderedRoutes.find((route) => !attemptedRoutes.current.has(route));
    if (!next) { setNotice(copy.exhausted); return; }
    readyStartedAt.current = performance.now();
    setNotice(copy.switched);
    setActiveRoute(next);
  }, [activeRoute, copy.exhausted, copy.switched, orderedRoutes]);
  const visibleRoutes = visibleIptvRoutes(orderedRoutes, expanded);
  const allHevc = routes.length > 0 && routes.every(isHevcRoute);

  return <div className="iptv-player" data-iptv-route-count={routes.length} data-active-route={activeRoute}>
    <div className="iptv-route-header"><h3>{copy.routes}</h3>{probing && <span role="status">{copy.probing}</span>}</div>
    <div className="iptv-route-list" role="group" aria-label={copy.routes}>{visibleRoutes.map((route) => {
      const routeIndex = routes.indexOf(route) + 1;
      const latency = latencies.get(route);
      return <button type="button" data-focusable key={route} aria-pressed={route === activeRoute} onClick={() => selectRoute(route)}>
        {copy.route} {routeIndex}{isHevcRoute(route) ? " · HEVC" : ""}{latency !== undefined ? ` · ${latency} ms` : ""}
      </button>;
    })}</div>
    {routes.length > 3 && <button type="button" className="iptv-route-toggle" data-focusable aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}>{expanded ? copy.collapse : copy.showAll}</button>}
    {!supportsHevc && allHevc && <p className="iptv-codec-notice" role="status">{copy.hevcOnly}</p>}
    {notice && <p className="iptv-route-notice" role="status">{notice}</p>}
    <MediaPlayer key={activeRoute} target={activeRoute} route="iptv-stream" title={channel.name}
      userAgent={channel.userAgent} referer={channel.referer} messages={copy} shellControls={copy}
      preferH264 focusable onReady={handleReady} onTerminalError={handleFailure} onClose={onClose} />
  </div>;
}
