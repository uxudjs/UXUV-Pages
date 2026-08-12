"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { useLocale } from "@/components/LocaleProvider";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { DisplaySettings } from "@/components/settings/DisplaySettings";
import { PlayerSettings } from "@/components/settings/PlayerSettings";
import { SourceSettings } from "@/components/settings/SourceSettings";
import { ContentApiError } from "@/lib/content/api-client";
import { unlockPremium, verifyPremiumAccess } from "@/lib/content/premium-client";
import { useAuth } from "@/lib/store/auth-store";

type AccessState = "loading" | "locked" | "ready" | "error";
const COPY = {
  "zh-CN": { title: "高级模式设置", description: "管理高级模式的内容源和偏好设置", loading: "正在验证 Premium 服务端授权…", locked: "Premium 授权已失效，请重新验证。", password: "Premium 密码", unlock: "验证", invalid: "Premium 验证失败。", error: "暂时无法验证 Premium 授权。", retry: "重试", recheck: "重新验证授权" },
  "zh-TW": { title: "進階模式設定", description: "管理與一般模式隔離的 Premium 來源和偏好設定。", loading: "正在驗證 Premium 伺服器授權…", locked: "Premium 授權已失效，請重新驗證。", password: "Premium 密碼", unlock: "驗證", invalid: "Premium 驗證失敗。", error: "暫時無法驗證 Premium 授權。", retry: "重試", recheck: "重新驗證授權" },
  en: { title: "Premium settings", description: "Manage Premium sources and preferences separately from standard mode.", loading: "Verifying server-side Premium access…", locked: "Premium access expired. Verify again to continue.", password: "Premium password", unlock: "Verify", invalid: "Premium verification failed.", error: "Premium access could not be verified.", retry: "Retry", recheck: "Verify access again" },
} as const;

export function PremiumSettingsExperience() {
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [state, setState] = useState<AccessState>("loading");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const verify = useCallback(async (signal?: AbortSignal) => {
    try { await verifyPremiumAccess(signal); setMessage(""); setState("ready"); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setState(error instanceof ContentApiError && error.status === 403 ? "locked" : "error");
      setMessage(error instanceof ContentApiError && error.status === 403 ? copy.locked : copy.error);
    }
  }, [auth, copy.error, copy.locked]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void verify(controller.signal); });
    return () => controller.abort();
  }, [verify]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await unlockPremium(password); setPassword(""); setState("loading"); await verify(); }
    catch { setMessage(copy.invalid); setState("locked"); }
  };

  if (state === "loading") return <main className="public-shell"><p role="status">{copy.loading}</p></main>;
  if (state === "locked") return <main className="public-shell"><form className="auth-panel" onSubmit={(event) => void submit(event)}>
    <h1>{copy.title}</h1><p role="alert">{message || copy.locked}</p><label className="field-label" htmlFor="premium-settings-password">{copy.password}</label>
    <input id="premium-settings-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
    <button className="primary-button" type="submit" disabled={!password}>{copy.unlock}</button></form></main>;
  if (state === "error") return <main className="public-shell"><section className="auth-panel" role="alert"><h1>{copy.title}</h1><p>{message}</p>
    <button type="button" onClick={() => { setState("loading"); void verify(); }}>{copy.retry}</button></section></main>;

  return <div className="content-shell settings-page-shell premium-settings-page"><main className="settings-shell">
    <header className="premium-settings-heading"><Link href="/premium" prefetch={false} aria-label={copy.recheck} data-focusable>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 19l-7-7 7-7" /></svg></Link>
      <div><h1>{copy.title}</h1><p>{copy.description}</p></div></header>
    <AdminGate><AccountSettings /></AdminGate>
    <PlayerSettings mode="premium" />
    <DisplaySettings mode="premium" />
    <SourceSettings mode="premium" />
  </main></div>;
}
