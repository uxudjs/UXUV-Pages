"use client";

import { UsersRound } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";

type MaybePromise<T> = T | Promise<T>;

interface VideoTogetherBridge {
  createRoom?: (roomId: string) => MaybePromise<void | string | { roomId?: string }>;
  joinRoom?: (roomId: string) => MaybePromise<void>;
  openSettings?: () => MaybePromise<void>;
}

interface OfficialVideoTogetherBridge {
  CreateRoom?: (roomId: string, password: string) => MaybePromise<void>;
  JoinRoom?: (roomId: string, password: string) => MaybePromise<void>;
}

declare global {
  interface Window {
    VideoTogether?: VideoTogetherBridge;
    videoTogetherExtension?: OfficialVideoTogetherBridge;
    __UXU_VIDEO_TOGETHER_MOCK__?: VideoTogetherBridge;
  }
}

type ScriptState = "disabled" | "loading" | "ready" | "error";
type ActionState = "idle" | "created" | "joined" | "error";

const COPY = {
  "zh-CN": {
    open: "一起看", title: "VideoTogether 一起看", close: "关闭", create: "创建房间", join: "加入房间",
    settings: "配置", roomLabel: "房间 ID", roomPlaceholder: "输入 3 至 64 位房间 ID",
    disabled: "部署管理员尚未通过 Worker RuntimeConfig 与 CSP 启用第三方脚本。",
    loading: "正在准备 VideoTogether…", ready: "VideoTogether 已就绪，房间状态由 VideoTogether 管理。",
    loadError: "VideoTogether 加载失败或未提供兼容接口。", invalid: "房间 ID 只能包含字母、数字、下划线和连字符。",
    actionError: "操作失败，请检查配置后重试。", created: "房间已创建", joined: "已加入房间",
  },
  "zh-TW": {
    open: "一起看", title: "VideoTogether 一起看", close: "關閉", create: "建立房間", join: "加入房間",
    settings: "設定", roomLabel: "房間 ID", roomPlaceholder: "輸入 3 至 64 位房間 ID",
    disabled: "部署管理員尚未透過 Worker RuntimeConfig 與 CSP 啟用第三方腳本。",
    loading: "正在準備 VideoTogether…", ready: "VideoTogether 已就緒，房間狀態由 VideoTogether 管理。",
    loadError: "VideoTogether 載入失敗或未提供相容介面。", invalid: "房間 ID 只能包含字母、數字、底線和連字號。",
    actionError: "操作失敗，請檢查設定後重試。", created: "房間已建立", joined: "已加入房間",
  },
  en: {
    open: "Watch together", title: "VideoTogether", close: "Close", create: "Create room", join: "Join room",
    settings: "Settings", roomLabel: "Room ID", roomPlaceholder: "Enter a 3-64 character room ID",
    disabled: "The deployment administrator has not enabled the third-party script through Worker RuntimeConfig and CSP.",
    loading: "Preparing VideoTogether…", ready: "VideoTogether is ready. VideoTogether manages the room state.",
    loadError: "VideoTogether failed to load or did not expose a compatible interface.",
    invalid: "Room IDs may contain only letters, numbers, underscores, and hyphens.",
    actionError: "The operation failed. Check the configuration and try again.", created: "Room created", joined: "Joined room",
  },
} as const;

const ROOM_ID = /^[A-Za-z0-9_-]{3,64}$/;
const SCRIPT_ID = "uxuv-videotogether-script";

function currentBridge(): VideoTogetherBridge | null {
  const injected = window.__UXU_VIDEO_TOGETHER_MOCK__ ?? window.VideoTogether;
  if (injected) return injected;
  const official = window.videoTogetherExtension;
  if (typeof official?.CreateRoom !== "function" || typeof official.JoinRoom !== "function") return null;
  return {
    createRoom: async (roomId) => {
      await official.CreateRoom?.(roomId, "");
      return roomId;
    },
    joinRoom: async (roomId) => official.JoinRoom?.(roomId, ""),
  };
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      ? parsed.href : null;
  } catch {
    return null;
  }
}

function roomIdFrom(result: void | string | { roomId?: string }, fallback: string): string {
  const value = typeof result === "string" ? result : result?.roomId ?? fallback;
  return ROOM_ID.test(value) ? value : "";
}

export function VideoTogetherController({ visible, open, onOpenChange }: Readonly<{
  visible: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { locale } = useLocale();
  const { config } = useRuntimeConfig();
  const copy = COPY[locale];
  const runtime = config.thirdPartyScripts.videoTogether;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [bridge, setBridge] = useState<VideoTogetherBridge | null>(null);
  const [scriptState, setScriptState] = useState<ScriptState>(runtime.enabled ? "loading" : "disabled");
  const [roomId, setRoomId] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionRoomId, setActionRoomId] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | "settings" | "">("");
  const scriptUrl = safePublicUrl(runtime.scriptUrl);
  const settingsUrl = safePublicUrl(runtime.settingUrl);

  useDialogFocusTrap({ open, dialogRef, returnFocusRef: triggerRef, onEscape: () => onOpenChange(false) });

  useEffect(() => {
    let active = true;
    let readyTimer = 0;
    const update = (state: ScriptState, nextBridge: VideoTogetherBridge | null) => {
      queueMicrotask(() => {
        if (!active) return;
        setBridge(nextBridge);
        setScriptState(state);
      });
    };
    if (!runtime.enabled) {
      update("disabled", null);
      return () => { active = false; };
    }
    if (!scriptUrl) {
      update("error", null);
      return () => { active = false; };
    }
    const installed = currentBridge();
    if (installed) {
      update("ready", installed);
      return () => { active = false; };
    }

    update("loading", null);
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = scriptUrl;
      script.async = true;
      script.referrerPolicy = "no-referrer";
    }
    const finish = () => {
      if (script) script.dataset.uxuvLoaded = "true";
      const deadline = Date.now() + 10_000;
      const detectBridge = () => {
        const loadedBridge = currentBridge();
        if (loadedBridge) {
          update("ready", loadedBridge);
        } else if (Date.now() >= deadline) {
          update("error", null);
        } else {
          readyTimer = window.setTimeout(detectBridge, 100);
        }
      };
      detectBridge();
    };
    const fail = () => {
      window.clearTimeout(readyTimer);
      update("error", null);
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (created) document.head.append(script);
    else if (script.dataset.uxuvLoaded === "true") finish();
    return () => {
      active = false;
      window.clearTimeout(readyTimer);
      script?.removeEventListener("load", finish);
      script?.removeEventListener("error", fail);
      if (created && !currentBridge()) script?.remove();
    };
  }, [runtime.enabled, scriptUrl]);

  const createRoom = async () => {
    const normalized = roomId.trim();
    if (!ROOM_ID.test(normalized)) {
      setActionRoomId("");
      setActionState("error");
      return;
    }
    if (!bridge?.createRoom) {
      setActionState("error");
      return;
    }
    setBusy("create");
    setActionState("idle");
    try {
      const createdRoomId = roomIdFrom(await bridge.createRoom(normalized), normalized);
      if (!createdRoomId) throw new Error("INVALID_ROOM_ID");
      setRoomId(createdRoomId);
      setActionRoomId(createdRoomId);
      setActionState("created");
    } catch {
      setActionState("error");
    } finally {
      setBusy("");
    }
  };

  const joinRoom = async () => {
    const normalized = roomId.trim();
    if (!ROOM_ID.test(normalized)) {
      setActionRoomId("");
      setActionState("error");
      return;
    }
    if (!bridge?.joinRoom) {
      setActionState("error");
      return;
    }
    setBusy("join");
    setActionState("idle");
    try {
      await bridge.joinRoom(normalized);
      setActionRoomId(normalized);
      setActionState("joined");
    } catch {
      setActionRoomId("");
      setActionState("error");
    } finally {
      setBusy("");
    }
  };

  const openSettings = async () => {
    setBusy("settings");
    setActionState("idle");
    try {
      if (bridge?.openSettings) await bridge.openSettings();
      else if (settingsUrl) window.open(settingsUrl, "_blank", "noopener,noreferrer");
      else throw new Error("SETTINGS_UNAVAILABLE");
    } catch {
      setActionState("error");
    } finally {
      setBusy("");
    }
  };

  const statusMessage = scriptState === "disabled" ? copy.disabled
    : scriptState === "loading" ? copy.loading
      : scriptState === "error" ? copy.loadError : copy.ready;
  const actionMessage = actionState === "created" ? `${copy.created}: ${actionRoomId}`
    : actionState === "joined" ? `${copy.joined}: ${actionRoomId}`
      : actionState === "error" ? (roomId.trim() && !ROOM_ID.test(roomId.trim()) ? copy.invalid : copy.actionError) : "";
  const ready = scriptState === "ready";

  return <>
    <div className="desktop-ad-filter-menu video-together-menu" aria-hidden={!visible && !open} inert={!visible && !open}
      style={{ right: 144, opacity: visible || open ? 1 : 0, visibility: visible || open ? "visible" : "hidden",
        pointerEvents: visible || open ? "auto" : "none" }}>
      <button ref={triggerRef} type="button" className="desktop-speed-trigger video-together-trigger"
        data-material="clear"
        aria-label={copy.open} aria-expanded={open} aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}>
        <UsersRound aria-hidden="true" />
      </button>
    </div>
    {open && createPortal(<>
      <button type="button" className="source-modal-backdrop" aria-label={copy.close}
        onClick={() => onOpenChange(false)} />
      <div ref={dialogRef} className="source-modal video-together-dialog" role="dialog" aria-modal="true"
        aria-labelledby="video-together-title" data-material="regular" data-videotogether-state={scriptState}>
        <header>
          <h2 id="video-together-title">{copy.title}</h2>
          <button type="button" data-focusable aria-label={copy.close} onClick={() => onOpenChange(false)}>×</button>
        </header>
        <p role={scriptState === "error" ? "alert" : "status"}>{statusMessage}</p>
        {ready && <form onSubmit={(event) => { event.preventDefault(); void joinRoom(); }}>
          <label>{copy.roomLabel}
            <input data-focusable data-autofocus value={roomId} maxLength={64} placeholder={copy.roomPlaceholder}
              autoComplete="off" spellCheck={false} onChange={(event) => { setRoomId(event.target.value); setActionState("idle"); }} />
          </label>
          {actionMessage && <p role={actionState === "error" ? "alert" : "status"}>{actionMessage}</p>}
          <div className="source-modal-actions">
            <button type="button" data-focusable disabled={Boolean(busy)} onClick={() => void createRoom()}>{copy.create}</button>
            <button type="submit" data-focusable disabled={Boolean(busy)}>{copy.join}</button>
            {(bridge?.openSettings || settingsUrl) && <button type="button" data-focusable disabled={Boolean(busy)}
              onClick={() => void openSettings()}>{copy.settings}</button>}
          </div>
        </form>}
      </div>
    </>, document.body)}
  </>;
}
