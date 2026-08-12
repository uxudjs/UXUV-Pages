"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, User } from "lucide-react";
import { AccountPreferenceBridge } from "@/components/AccountPreferenceBridge";
import { AppUpdateControl, clearAppUpdateCache } from "@/components/AppUpdateControl";
import { useLocale } from "@/components/LocaleProvider";
import { PublicPage } from "@/components/PublicPage";
import { ScrollPositionManager } from "@/components/ScrollPositionManager";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { SyncProvider } from "@/components/SyncProvider";
import { SyncStatus } from "@/components/SyncStatus";
import { TVNavigationInitializer } from "@/components/TVNavigationInitializer";
import { UsageAlertProvider } from "@/components/UsageAlertProvider";
import { Button } from "@/components/ui/Button";
import { BackToTop } from "@/components/ui/BackToTop";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { AuthContext, type AuthSession } from "@/lib/store/auth-store";

const LOGIN_COPY = {
  "zh-CN": {
    title: "访问受限",
    description: "请输入用户名和密码以继续",
    username: "用户名",
    usernamePlaceholder: "输入用户名...",
    password: "密码",
    passwordPlaceholder: "输入密码...",
    submit: "登录",
    submitting: "登录中...",
    invalid: "用户名或密码不正确。",
    network: "登录请求失败，请稍后重试。",
    expired: "会话已失效，请重新登录。",
    loading: "正在确认运行配置与安全会话…",
    startupTitle: "无法启动应用",
    startupDescription: "应用暂时无法启动，请稍后重试。",
    setupTitle: "尚未完成设置",
    setupDescription: "Worker 尚未提供有效的运行配置。请完成服务器端设置后重试。",
    sessionTitle: "会话服务暂时不可用",
    sessionDescription: "无法确认安全会话，请稍后重试。",
    retry: "重试",
  },
  "zh-TW": {
    title: "存取受限",
    description: "請輸入使用者名稱和密碼以繼續",
    username: "使用者名稱",
    usernamePlaceholder: "輸入使用者名稱...",
    password: "密碼",
    passwordPlaceholder: "輸入密碼...",
    submit: "登入",
    submitting: "登入中...",
    invalid: "使用者名稱或密碼不正確。",
    network: "登入請求失敗，請稍後再試。",
    expired: "工作階段已失效，請重新登入。",
    loading: "正在確認執行設定與安全工作階段…",
    startupTitle: "無法啟動應用程式",
    startupDescription: "應用程式暫時無法啟動，請稍後再試。",
    setupTitle: "尚未完成設定",
    setupDescription: "Worker 尚未提供有效的執行設定。請完成伺服器端設定後再試。",
    sessionTitle: "工作階段服務暫時無法使用",
    sessionDescription: "無法確認安全工作階段，請稍後再試。",
    retry: "重試",
  },
  en: {
    title: "Access restricted",
    description: "Enter your username and password to continue",
    username: "Username",
    usernamePlaceholder: "Enter username...",
    password: "Password",
    passwordPlaceholder: "Enter password...",
    submit: "Sign in",
    submitting: "Signing in...",
    invalid: "The username or password is incorrect.",
    network: "The sign-in request failed. Try again later.",
    expired: "Your session expired. Sign in again.",
    loading: "Checking runtime configuration and secure session…",
    startupTitle: "Unable to start the application",
    startupDescription: "The application cannot start right now. Try again later.",
    setupTitle: "Setup is incomplete",
    setupDescription: "The Worker did not provide a valid runtime configuration. Complete server setup and retry.",
    sessionTitle: "Session service is unavailable",
    sessionDescription: "The secure session could not be confirmed. Try again later.",
    retry: "Retry",
  },
} as const;

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
  const { locale } = useLocale();
  const [sessionOverride, setSessionOverride] = useState<AuthSession | null | undefined>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const session = sessionOverride === undefined ? runtime.session : sessionOverride;
  const copy = LOGIN_COPY[locale];
  const startup = runtime.issue === "setup"
    ? { title: copy.setupTitle, description: copy.setupDescription }
    : runtime.issue === "session"
      ? { title: copy.sessionTitle, description: copy.sessionDescription }
      : { title: copy.startupTitle, description: copy.startupDescription };

  useEffect(() => {
    if (runtime.status === "ready" && !session) usernameRef.current?.focus();
  }, [runtime.status, session]);

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
      if (session) clearAppUpdateCache(session.accountId);
      setSessionOverride(null);
      setPassword("");
    }
  }, [session]);

  const markSessionExpired = useCallback(() => {
    if (session) clearAppUpdateCache(session.accountId);
    setMessage(LOGIN_COPY[locale].expired);
    setSessionOverride(null);
  }, [locale, session]);

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
        setMessage(responseMessage(body, copy.invalid));
        passwordRef.current?.focus();
        return;
      }
      setSessionOverride(body.session);
      setPassword("");
    } catch {
      setMessage(copy.network);
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  if (runtime.status === "public") {
    return <PublicPage title={runtime.config.site.name} />;
  }
  if (runtime.status === "loading") {
    return <main className="public-shell" role="status" aria-live="polite">{copy.loading}</main>;
  }
  if (runtime.status === "error") {
    return (
      <main className="public-shell">
        <section className="public-notice" role="alert">
          <h1 className="public-title">{startup.title}</h1>
          <p className="public-description">{startup.description}</p>
          <button className="primary-button" type="button" autoFocus onClick={runtime.retry}>{copy.retry}</button>
        </section>
      </main>
    );
  }
  if (!context) {
    return (
      <main className="auth-shell">
        <div className="auth-frame">
          <form
            className="auth-card"
            onSubmit={submit}
            aria-labelledby="login-title"
            aria-busy={submitting}
            data-error={Boolean(message)}
          >
            <div className="auth-lock" aria-hidden="true">
              <Icon source={Lock} size={32} />
            </div>
            <div className="auth-heading">
              <h2 id="login-title">{copy.title}</h2>
              <p>{copy.description}</p>
            </div>
            <div className="auth-fields">
              <Input
                ref={usernameRef}
                id="login-username"
                name="username"
                label={copy.username}
                leadingIcon={User}
                autoComplete="username"
                placeholder={copy.usernamePlaceholder}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setMessage("");
                }}
              />
              <Input
                ref={passwordRef}
                id="login-password"
                name="password"
                type="password"
                label={copy.password}
                autoComplete="current-password"
                placeholder={copy.passwordPlaceholder}
                aria-invalid={Boolean(message)}
                aria-describedby={message ? "login-error" : undefined}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setMessage("");
                }}
              />
              {message && <p className="auth-error" id="login-error" role="alert">{message}</p>}
              <Button type="submit" disabled={submitting}>{submitting ? copy.submitting : copy.submit}</Button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={context}>
      <UsageAlertProvider>
          <SyncProvider key={context.session.accountId} accountId={context.session.accountId}>
            <div className="application-shell">
              <AppUpdateControl />
              <AccountPreferenceBridge accountId={context.session.accountId} />
              <SyncStatus />
              <ScrollPositionManager accountId={context.session.accountId} />
              <TVNavigationInitializer />
              {children}
              <BackToTop />
            </div>
        </SyncProvider>
      </UsageAlertProvider>
    </AuthContext.Provider>
  );
}
