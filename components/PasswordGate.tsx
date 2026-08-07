"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { PublicPage } from "@/components/PublicPage";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { SyncProvider } from "@/components/SyncProvider";
import { SyncStatus } from "@/components/SyncStatus";
import { UsageAlertProvider } from "@/components/UsageAlertProvider";
import { AuthContext, type AuthSession } from "@/lib/store/auth-store";

function responseMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return typeof record.message === "string" ? record.message : fallback;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function PasswordGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const runtime = useRuntimeConfig();
  const [sessionOverride, setSessionOverride] = useState<AuthSession | null | undefined>();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const session = sessionOverride === undefined ? runtime.session : sessionOverride;

  const refreshSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { credentials: "same-origin" });
    const body = await readBody(response) as { authenticated?: boolean; session?: AuthSession } | null;
    const nextSession = response.ok && body?.authenticated && body.session ? body.session : null;
    setSessionOverride(nextSession);
    return !!nextSession;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      setSessionOverride(null);
      setPassword("");
    }
  }, []);

  const markSessionExpired = useCallback(() => {
    setMessage("会话已失效，请重新登录。");
    setSessionOverride(null);
  }, []);

  const context = useMemo(() => session ? {
    session,
    refreshSession,
    markSessionExpired,
    signOut,
  } : null, [markSessionExpired, refreshSession, session, signOut]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await readBody(response) as { session?: AuthSession } | null;
      if (!response.ok || !body?.session) {
        setMessage(responseMessage(body, "用户名或密码不正确。"));
        return;
      }
      setSessionOverride(body.session);
      setPassword("");
    } catch {
      setMessage("登录请求失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  if (runtime.status === "public") {
    return <PublicPage title={runtime.config.site.name} description={runtime.config.site.description} />;
  }
  if (runtime.status === "loading") {
    return <main className="public-shell" role="status" aria-live="polite">正在确认运行配置与安全会话…</main>;
  }
  if (runtime.status === "error") {
    return (
      <main className="public-shell">
        <section className="public-notice" role="alert">
          <h1 className="public-title">无法启动应用</h1>
          <p className="public-description">{runtime.error}</p>
          <button className="primary-button" type="button" onClick={runtime.retry}>重试</button>
        </section>
      </main>
    );
  }
  if (!context) {
    return (
      <main className="public-shell">
        <form className="auth-panel" onSubmit={submit} aria-labelledby="login-title">
          <p className="public-kicker">{runtime.config.site.name}</p>
          <h1 className="public-title" id="login-title">登录</h1>
          <label className="field-label" htmlFor="username">用户名</label>
          <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <label className="field-label" htmlFor="password">密码</label>
          <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "登录中…" : "登录"}</button>
        </form>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={context}>
      <UsageAlertProvider>
        <SyncProvider accountId={context.session.accountId}>
          <div className="application-shell">
            <header className="session-bar">
              <p><strong>{context.session.name}</strong><span>{context.session.role}</span></p>
              <button type="button" onClick={() => void signOut()}>退出登录</button>
            </header>
            <SyncStatus />
            {children}
          </div>
        </SyncProvider>
      </UsageAlertProvider>
    </AuthContext.Provider>
  );
}
