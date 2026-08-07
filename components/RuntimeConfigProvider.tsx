"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { type AuthSession, isDirectPagesHost } from "@/lib/store/auth-store";

export interface RuntimeConfig {
  release: { worker: string; pages: string; apiContract: number };
  site: { name: string; title: string; description: string; iconUrl: string };
  capabilities: { premium: boolean; iptv: boolean; danmaku: boolean };
  adKeywords: string[];
  thirdPartyScripts: {
    videoTogether: { enabled: boolean; scriptUrl: string | null; settingUrl: string | null };
  };
  authenticated: boolean;
  sources?: {
    subscriptionSources: string;
    iptvSources: string;
    mergeSources: boolean;
    danmakuApiUrl: string;
  };
}

type RuntimeStatus = "loading" | "public" | "ready" | "error";

interface RuntimeConfigContextValue {
  status: RuntimeStatus;
  config: RuntimeConfig;
  session: AuthSession | null;
  error: string;
  retry: () => void;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  release: { worker: "", pages: "0.1.2", apiContract: 1 },
  site: {
    name: "UXUVideo",
    title: "UXUVideo",
    description: "UXUVideo 公共静态前端入口",
    iconUrl: "/UXUV-Pages/0.1.2/icon.png",
  },
  capabilities: { premium: false, iptv: false, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: {
    videoTogether: { enabled: false, scriptUrl: null, settingUrl: null },
  },
  authenticated: false,
};

const RuntimeConfigContext = createContext<RuntimeConfigContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (!isRecord(value) || !isRecord(value.release) || !isRecord(value.site)) return false;
  return typeof value.release.worker === "string"
    && typeof value.release.pages === "string"
    && typeof value.release.apiContract === "number"
    && typeof value.site.name === "string"
    && typeof value.site.title === "string"
    && typeof value.site.description === "string"
    && typeof value.site.iconUrl === "string"
    && isRecord(value.capabilities)
    && Array.isArray(value.adKeywords)
    && isRecord(value.thirdPartyScripts);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function RuntimeConfigProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<RuntimeConfigContextValue, "retry">>({
    status: "loading",
    config: DEFAULT_RUNTIME_CONFIG,
    session: null,
    error: "",
  });

  useEffect(() => {
    if (isDirectPagesHost(window.location.hostname)) {
      queueMicrotask(() => setState({
        status: "public",
        config: DEFAULT_RUNTIME_CONFIG,
        session: null,
        error: "",
      }));
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const [configResponse, sessionResponse] = await Promise.all([
          fetch("/api/config", { credentials: "same-origin" }),
          fetch("/api/auth/session", { credentials: "same-origin" }),
        ]);
        const [configBody, sessionBody] = await Promise.all([
          readJson(configResponse),
          readJson(sessionResponse),
        ]);
        if (!configResponse.ok || !isRuntimeConfig(configBody)) {
          throw new Error("运行时配置不可用。");
        }
        if (!sessionResponse.ok && sessionResponse.status !== 401) {
          throw new Error("会话服务不可用。");
        }
        const sessionRecord = isRecord(sessionBody) ? sessionBody : null;
        const session = sessionRecord?.authenticated && isRecord(sessionRecord.session)
          ? sessionRecord.session as unknown as AuthSession
          : null;
        if (active) setState({ status: "ready", config: configBody, session, error: "" });
      } catch (error) {
        if (active) setState({
          status: "error",
          config: DEFAULT_RUNTIME_CONFIG,
          session: null,
          error: error instanceof Error ? error.message : "应用启动失败。",
        });
      }
    };
    void load();
    return () => { active = false; };
  }, [attempt]);

  const value = useMemo<RuntimeConfigContextValue>(() => ({
    ...state,
    retry: () => {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      setAttempt((current) => current + 1);
    },
  }), [state]);

  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  const value = useContext(RuntimeConfigContext);
  if (!value) throw new Error("RuntimeConfigProvider is required.");
  return value;
}
