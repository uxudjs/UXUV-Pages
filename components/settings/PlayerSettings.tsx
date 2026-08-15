"use client";

import { FastForward, Globe2, Maximize, MessageSquareText, Users } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Switch";
import { useSync } from "@/components/SyncProvider";
import { usePlayerSettings } from "@/lib/hooks/usePlayerSettings";
import {
  MAX_SEEK_STEP_SECONDS, MAX_SKIP_SECONDS, MIN_SEEK_STEP_SECONDS, normalizeAdKeywords, normalizeDanmakuApis,
  unsafeDanmakuUrlReason, type AdFilterMode, type FullscreenType, type ProxyMode,
} from "@/lib/player/player-settings";
import { useAuth } from "@/lib/store/auth-store";
import type { ConfigPayload } from "@/lib/sync/document-types";

const COPY = {
  "zh-CN": { title: "播放器设置", description: "配置播放方式、跳过、广告过滤与弹幕外观。", restricted: "当前账户没有修改播放器设置的权限；现有值仍可查看。",
    fullscreen: "默认全屏方式", fullscreenHint: "选择在桌面端点击播放器全屏按钮时的行为", native: "系统全屏", nativeHint: "进入浏览器原生全屏状态", window: "网页全屏", windowHint: "播放器填满当前浏览器窗口",
    seek: "快进 / 快退间隔", seekHint: "控制键盘 J / L、方向键和双击手势每次跳转的秒数", customSeconds: "自定义秒数",
    proxy: "代理播放模式", proxyHint: "控制普通视频播放时的网络请求策略", retry: "智能重试 (推荐)", retryHint: "优先使用内置代理，网络失败后回退一次浏览器直连", none: "仅直连", noneHint: "浏览器直接请求第三方媒体，失败则报错", always: "总是代理", alwaysHint: "所有请求都通过内置代理转发",
    safeBoundary: "安全边界：直连仅用于普通视频的 HTTP(S) 媒体地址；IPTV 与“总是代理”仍保持 same-origin Worker。第三方媒体必须允许 CORS。",
    videoTogether: "一起看 (VideoTogether)", videoTogetherHint: "关闭后不显示一起看悬浮入口；开启后仅在播放器和 IPTV 页面显示，且默认折叠为小图标，用户可自行展开。", videoTogetherToggle: "一起看开关",
    autoNext: "自动下一集", indicator: "显示播放模式标识", intro: "跳过片头", introSeconds: "片头时长（秒）", outro: "跳过片尾", outroSeconds: "片尾剩余（秒）",
    ads: "广告过滤", adsHint: "选择清单过滤强度，并管理当前账户的自定义关键词。", off: "关闭", keyword: "关键词", heuristic: "智能（Beta）", aggressive: "激进",
    keywordPlaceholder: "广告关键词", add: "添加", remove: "移除关键词", serverKeyword: "服务端关键词",
    danmaku: "弹幕外观", danmakuUnavailable: "当前部署或账户尚未提供可用弹幕 API，弹幕开关保持禁用。", enabled: "启用弹幕", opacity: "弹幕透明度", fontSize: "弹幕字号", area: "弹幕显示区域" },
  "zh-TW": { title: "播放器設定", description: "設定播放方式、略過、廣告過濾與彈幕外觀。", restricted: "目前帳戶沒有修改播放器設定的權限；仍可檢視現有值。",
    fullscreen: "預設全螢幕方式", fullscreenHint: "選擇桌面端全螢幕按鈕的行為。", native: "系統全螢幕", nativeHint: "進入瀏覽器原生全螢幕", window: "網頁全螢幕", windowHint: "播放器填滿目前視窗",
    seek: "快進 / 快退間隔", seekHint: "控制 J / L、方向鍵和雙擊手勢每次跳轉的秒數。", customSeconds: "自訂秒數",
    proxy: "代理播放模式", proxyHint: "控制一般影片播放時的網路請求策略", retry: "智慧重試（建議）", retryHint: "優先使用內建代理，網路失敗後回退一次瀏覽器直連", none: "僅直連", noneHint: "瀏覽器直接請求第三方媒體，失敗即回報", always: "總是代理", alwaysHint: "所有請求都透過內建代理轉送",
    safeBoundary: "安全邊界：直連僅用於一般影片的 HTTP(S) 媒體位址；IPTV 與「總是代理」仍維持 same-origin Worker。第三方媒體必須允許 CORS。",
    videoTogether: "一起看 (VideoTogether)", videoTogetherHint: "開啟後在播放器和 IPTV 頁面顯示一起看入口；腳本位址已由 Worker 內建，無需另行設定。", videoTogetherToggle: "啟用一起看",
    autoNext: "自動下一集", indicator: "顯示播放模式標示", intro: "略過片頭", introSeconds: "片頭時長（秒）", outro: "略過片尾", outroSeconds: "片尾剩餘（秒）",
    ads: "廣告過濾", adsHint: "選擇清單過濾強度，並管理目前帳戶的自訂關鍵詞。", off: "關閉", keyword: "關鍵詞", heuristic: "智慧（Beta）", aggressive: "積極",
    keywordPlaceholder: "廣告關鍵詞", add: "新增", remove: "移除關鍵詞", serverKeyword: "伺服器關鍵詞",
    danmaku: "彈幕外觀", danmakuUnavailable: "目前部署或帳戶尚未提供可用彈幕 API，彈幕開關維持停用。", enabled: "啟用彈幕", opacity: "彈幕透明度", fontSize: "彈幕字號", area: "彈幕顯示區域" },
  en: { title: "Player settings", description: "Configure playback, skipping, ad filtering, and danmaku appearance.", restricted: "This account cannot change player settings; current values remain visible.",
    fullscreen: "Default fullscreen mode", fullscreenHint: "Choose how the desktop fullscreen button behaves.", native: "System fullscreen", nativeHint: "Use the browser's native fullscreen", window: "Window fullscreen", windowHint: "Fill the current browser window",
    seek: "Seek interval", seekHint: "Controls each J / L, arrow-key, and double-tap jump.", customSeconds: "Custom seconds",
    proxy: "Playback proxy mode", proxyHint: "Control the network path for regular video playback.", retry: "Smart retry (recommended)", retryHint: "Use the built-in proxy first, then fall back once to a browser-direct request after a network failure", none: "Direct only", noneHint: "Request third-party media in the browser and report failures", always: "Always proxy", alwaysHint: "Route every request through the built-in proxy",
    safeBoundary: "Safety boundary: direct requests are limited to HTTP(S) media for regular videos; IPTV and Always proxy stay on the same-origin Worker. Third-party media must allow CORS.",
    videoTogether: "Watch together (VideoTogether)", videoTogetherHint: "Show the watch-together entry on player and IPTV pages. The Worker already provides the script URL.", videoTogetherToggle: "Enable VideoTogether",
    autoNext: "Auto-play next episode", indicator: "Show playback mode", intro: "Skip intro", introSeconds: "Intro duration (seconds)", outro: "Skip outro", outroSeconds: "Outro remaining (seconds)",
    ads: "Ad filtering", adsHint: "Choose playlist filtering strength and manage account-specific keywords.", off: "Off", keyword: "Keywords", heuristic: "Smart (Beta)", aggressive: "Aggressive",
    keywordPlaceholder: "Ad keyword", add: "Add", remove: "Remove keyword", serverKeyword: "Server keyword",
    danmaku: "Danmaku appearance", danmakuUnavailable: "This deployment or account has no available danmaku API, so the danmaku switch stays disabled.", enabled: "Enable danmaku", opacity: "Danmaku opacity", fontSize: "Danmaku font size", area: "Danmaku display area" },
} as const;

const DANMAKU_COPY = {
  "zh-CN": { title: "弹幕设置", hint: "配置弹幕聚合 API 地址，在播放器菜单中开关弹幕", api: "API 地址", placeholder: "https://your-danmu-api.example.com", help: "兼容 danmu_api 格式的弹幕聚合服务" },
  "zh-TW": { title: "彈幕設定", hint: "設定彈幕聚合 API 位址，在播放器選單中開關彈幕", api: "API 位址", placeholder: "https://your-danmu-api.example.com", help: "相容 danmu_api 格式的彈幕聚合服務" },
  en: { title: "Danmaku settings", hint: "Configure a danmaku aggregation API and control danmaku from the player menu.", api: "API address", placeholder: "https://your-danmu-api.example.com", help: "Compatible with danmu_api aggregation services" },
} as const;

const BASELINE_COPY = {
  "zh-CN": { seekRange: "范围 1-120 秒，默认 10 秒", endpoint: "内置代理端点", endpointHelp: "此处不是第三方 HTTP/SOCKS 代理配置。播放器会按上方模式把播放地址交给当前 UXUVideo 部署的内置代理；该能力只在传统 Node.js 自托管完整模式下启用。" },
  "zh-TW": { seekRange: "範圍 1-120 秒，預設 10 秒", endpoint: "內建代理端點", endpointHelp: "此處不是第三方 HTTP/SOCKS 代理設定。播放器會依上方模式把播放位址交給目前 UXUVideo 部署的內建代理；此功能只在傳統 Node.js 自架完整模式下啟用。" },
  en: { seekRange: "Range 1-120 seconds; default 10 seconds", endpoint: "Built-in proxy endpoint", endpointHelp: "This is not a third-party HTTP/SOCKS proxy setting. Playback passes media URLs to the current UXUVideo Worker while the browser remains on the same-origin boundary." },
} as const;

const AREA_LABELS = {
  "zh-CN": [[0.25, "1/4屏"], [0.5, "半屏"], [0.75, "3/4屏"], [1, "全屏"]],
  "zh-TW": [[0.25, "1/4螢幕"], [0.5, "半螢幕"], [0.75, "3/4螢幕"], [1, "全螢幕"]],
  en: [[0.25, "1/4"], [0.5, "1/2"], [0.75, "3/4"], [1, "Full"]],
} as const;

function Choice({ active, disabled, title, detail, onClick }: Readonly<{ active: boolean; disabled: boolean; title: string; detail: string; onClick: () => void }>) {
  return <button type="button" className="preference-choice" aria-pressed={active} disabled={disabled} data-focusable onClick={onClick}>
    <strong>{title}</strong><small>{detail}</small>
  </button>;
}

export function PlayerSettings({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const auth = useAuth()!;
  const { locale } = useLocale();
  const runtime = useRuntimeConfig();
  const sync = useSync();
  const copy = COPY[locale];
  const danmakuCopy = DANMAKU_COPY[locale];
  const baselineCopy = BASELINE_COPY[locale];
  const settings = usePlayerSettings(auth.session.accountId, mode);
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const fieldName = (key: string) => mode === "premium" ? `premium.${key}` : key;
  const field = (key: string) => fields[fieldName(key)];
  const danmakuApis = normalizeDanmakuApis(field("danmakuApis")?.value);
  const activeDanmakuApiId = typeof field("activeDanmakuApiId")?.value === "string" ? field("activeDanmakuApiId")?.value as string : null;
  const activeDanmakuApi = danmakuApis.find(({ id }) => id === activeDanmakuApiId);
  const permissions = new Set(auth.session.customPermissions);
  const roleAllows = auth.session.role === "admin" || auth.session.role === "super_admin";
  const canPlayer = roleAllows || permissions.has("player_settings");
  const canDanmaku = roleAllows || permissions.has("danmaku_appearance");
  const [adKeyword, setAdKeyword] = useState("");
  const customAdKeywords = normalizeAdKeywords(field("adKeywords")?.value);
  const serverAdKeywords = new Set(runtime.config.adKeywords);
  const commitDanmakuUrl = (raw: string) => {
    const value = raw.trim();
    if (!value || unsafeDanmakuUrlReason(value)) return;
    const id = activeDanmakuApi?.id ?? "legacy-danmaku-api";
    sync.updateConfigField(fieldName("danmakuApis"), [
      ...danmakuApis.filter((api) => api.id !== id),
      { id, name: activeDanmakuApi?.name ?? "UXUVideo", url: value },
    ]);
    sync.updateConfigField(fieldName("activeDanmakuApiId"), id);
  };
  const setNumber = (key: "seekStepSeconds" | "skipIntroSeconds" | "skipOutroSeconds", raw: string, max: number, min = 0) => {
    const value = Number(raw);
    if (Number.isFinite(value)) settings.set(key, Math.min(max, Math.max(min, Math.round(value))));
  };
  const addAdKeyword = () => {
    const next = normalizeAdKeywords([...customAdKeywords, adKeyword]);
    if (next.length === customAdKeywords.length) return;
    settings.set("adKeywords", next);
    setAdKeyword("");
  };

  return <SettingsSection id="player" title={copy.title}>
    <div className="preference-stack player-settings-stack" data-player-mode={mode}>
      {!canPlayer && <p className="settings-restriction" role="note">{copy.restricted}</p>}
      <div className="preference-group"><h3 className="preference-title"><Icon source={Maximize} size={18} />{copy.fullscreen}</h3><p>{copy.fullscreenHint}</p><div className="preference-grid">
        {(["native", "window"] as FullscreenType[]).map((mode) => <Choice key={mode} active={settings.fullscreenType === mode} disabled={!canPlayer}
          title={mode === "native" ? copy.native : copy.window} detail={mode === "native" ? copy.nativeHint : copy.windowHint}
          onClick={() => settings.set("fullscreenType", mode)} />)}
      </div></div>
      <div className="preference-group player-seek-settings"><h3 className="preference-title"><Icon source={FastForward} size={18} />{copy.seek}</h3><p>{copy.seekHint}</p><div className="preference-pills">
        {[5, 10, 15, 30, 60].map((seconds) => <button key={seconds} type="button" aria-pressed={settings.seekStepSeconds === seconds} disabled={!canPlayer}
          onClick={() => settings.set("seekStepSeconds", seconds)}>{seconds} {locale === "en" ? "s" : "秒"}</button>)}
      </div><label className="preference-number"><span>{copy.customSeconds}</span><div className="preference-number-input"><input type="number" min={MIN_SEEK_STEP_SECONDS} max={MAX_SEEK_STEP_SECONDS}
        value={settings.seekStepSeconds} disabled={!canPlayer} onChange={(event) => setNumber("seekStepSeconds", event.target.value, MAX_SEEK_STEP_SECONDS, MIN_SEEK_STEP_SECONDS)} /><span>{locale === "en" ? "s" : "秒"}</span></div><small>{baselineCopy.seekRange}</small></label></div>
      <div className="preference-group player-proxy-settings"><h3 className="preference-title"><Icon source={Globe2} size={18} />{copy.proxy}</h3><p>{copy.proxyHint}</p><div className="preference-grid preference-grid-three">
        {(["retry", "none", "always"] as ProxyMode[]).map((mode) => <Choice key={mode} active={settings.proxyMode === mode} disabled={!canPlayer}
          title={copy[mode]} detail={copy[`${mode}Hint`]} onClick={() => settings.set("proxyMode", mode)} />)}
      </div><div className="player-proxy-endpoint"><strong>{baselineCopy.endpoint}</strong><code>/api/proxy?url=&lt;encoded-video-url&gt;</code><p>{baselineCopy.endpointHelp}</p></div></div>
      {mode === "standard" && <div className="preference-group player-video-together"><h3 className="preference-title"><Icon source={Users} size={18} />{copy.videoTogether}</h3><p>{copy.videoTogetherHint}</p>
        <Switch ariaLabel={copy.videoTogetherToggle} checked={settings.videoTogetherEnabled} disabled={!canPlayer}
          onChange={(checked) => settings.set("videoTogetherEnabled", checked)} /></div>}
      <div className="preference-group player-automation-settings">
        <div className="preference-toggle"><span><h3>{copy.autoNext}</h3></span>
          <Switch ariaLabel={copy.autoNext} checked={settings.autoNextEpisode} disabled={!canPlayer}
            onChange={(checked) => settings.set("autoNextEpisode", checked)} /></div>
        <div className="preference-toggle"><span><h3>{copy.indicator}</h3></span>
          <Switch ariaLabel={copy.indicator} checked={settings.showModeIndicator} disabled={!canPlayer}
            onChange={(checked) => settings.set("showModeIndicator", checked)} /></div>
        <div className="preference-toggle"><span><h3>{copy.intro}</h3></span>
          <Switch ariaLabel={copy.intro} checked={settings.autoSkipIntro} disabled={!canPlayer}
            onChange={(checked) => settings.set("autoSkipIntro", checked)} /></div>
        <label className="preference-number"><span>{copy.introSeconds}</span><input type="number" min="0" max={MAX_SKIP_SECONDS}
          value={settings.skipIntroSeconds} disabled={!canPlayer || !settings.autoSkipIntro}
          onChange={(event) => setNumber("skipIntroSeconds", event.target.value, MAX_SKIP_SECONDS)} /></label>
        <div className="preference-toggle"><span><h3>{copy.outro}</h3></span>
          <Switch ariaLabel={copy.outro} checked={settings.autoSkipOutro} disabled={!canPlayer}
            onChange={(checked) => settings.set("autoSkipOutro", checked)} /></div>
        <label className="preference-number"><span>{copy.outroSeconds}</span><input type="number" min="0" max={MAX_SKIP_SECONDS}
          value={settings.skipOutroSeconds} disabled={!canPlayer || !settings.autoSkipOutro}
          onChange={(event) => setNumber("skipOutroSeconds", event.target.value, MAX_SKIP_SECONDS)} /></label>
      </div>
      <div className="preference-group player-ad-settings"><h3>{copy.ads}</h3><p>{copy.adsHint}</p>
        <div className="preference-grid preference-grid-four">{(["off", "keyword", "heuristic", "aggressive"] as AdFilterMode[]).map((filterMode) =>
          <Choice key={filterMode} active={settings.adFilterMode === filterMode} disabled={!canPlayer} title={copy[filterMode]} detail=""
            onClick={() => settings.set("adFilterMode", filterMode)} />)}</div>
        <div className="preference-block-form"><input maxLength={40} value={adKeyword} placeholder={copy.keywordPlaceholder} disabled={!canPlayer}
          onChange={(event) => setAdKeyword(event.target.value)} /><button type="button" disabled={!canPlayer || !adKeyword.trim()}
          onClick={addAdKeyword}>{copy.add}</button></div>
        <div className="preference-chips">{settings.adKeywords.map((keyword) => serverAdKeywords.has(keyword)
          ? <span key={keyword}>{keyword} · {copy.serverKeyword}</span>
          : <button type="button" key={keyword} disabled={!canPlayer} aria-label={`${copy.remove} ${keyword}`}
            onClick={() => settings.set("adKeywords", customAdKeywords.filter((value) => value !== keyword))}>{keyword} ×</button>)}</div>
      </div>
      <div className="preference-group"><h3 className="preference-title"><Icon source={MessageSquareText} size={18} />{danmakuCopy.title}</h3><p>{danmakuCopy.hint}</p>
        {!runtime.config.capabilities.danmaku && <p role="note">{copy.danmakuUnavailable}</p>}
        <div className="preference-toggle player-danmaku-enabled"><span><h3>{copy.enabled}</h3></span>
          <Switch ariaLabel={copy.enabled} checked={settings.danmakuEnabled} disabled={!canDanmaku || !runtime.config.capabilities.danmaku}
            onChange={(checked) => settings.set("danmakuEnabled", checked)} /></div>
        <label className="preference-number player-danmaku-api"><span>{danmakuCopy.api}</span><input key={`${activeDanmakuApi?.id ?? "legacy-danmaku-api"}:${activeDanmakuApi?.url ?? ""}`}
          type="url" placeholder={danmakuCopy.placeholder} defaultValue={activeDanmakuApi?.url ?? ""} disabled={!canDanmaku}
          onBlur={(event) => commitDanmakuUrl(event.currentTarget.value)} /><small>{danmakuCopy.help}</small></label>
        <label className="preference-range"><span>{copy.opacity}{locale === "en" ? ": " : "："}{Math.round(settings.danmakuOpacity * 100)}%</span><input type="range" min="10" max="100"
          value={Math.round(settings.danmakuOpacity * 100)} disabled={!canDanmaku} onChange={(event) => settings.set("danmakuOpacity", Number(event.target.value) / 100)} /></label>
        <div className="player-pills-group"><span>{copy.fontSize}</span><div className="preference-pills player-font-pills" aria-label={copy.fontSize}>{[14, 18, 20, 24, 28].map((size) => <button type="button" key={size}
          aria-pressed={settings.danmakuFontSize === size} disabled={!canDanmaku} onClick={() => settings.set("danmakuFontSize", size)}>{size}px</button>)}</div>
        </div><div className="player-pills-group player-area-group"><span>{copy.area}</span><div className="preference-pills" aria-label={copy.area}>{AREA_LABELS[locale].map(([area, label]) => <button type="button"
          key={area} aria-pressed={settings.danmakuDisplayArea === area} disabled={!canDanmaku} onClick={() => settings.set("danmakuDisplayArea", area as number)}>{label}</button>)}</div></div>
      </div>
    </div>
  </SettingsSection>;
}
