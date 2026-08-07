"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { type Role, useAuth } from "@/lib/store/auth-store";

interface AccountInfo {
  id: string;
  username: string;
  name: string;
  role: Role;
  customPermissions: string[];
  createdAt: number;
  updatedAt: number;
}

interface AccountsResponse {
  accounts?: AccountInfo[];
  account?: AccountInfo;
  error?: { message?: string };
}

async function responseBody(response: Response): Promise<AccountsResponse> {
  try {
    return await response.json() as AccountsResponse;
  } catch {
    return {};
  }
}

export function AccountSettings() {
  const auth = useAuth();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const handleFailure = useCallback(async (response: Response, fallback: string) => {
    if (response.status === 401) auth?.markSessionExpired();
    const body = await responseBody(response);
    throw new Error(body.error?.message || fallback);
  }, [auth]);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/accounts", { credentials: "same-origin" });
      if (!response.ok) await handleFailure(response, "无法读取账户。");
      const body = await responseBody(response);
      setAccounts(body.accounts ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取账户。");
    } finally {
      setLoading(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    queueMicrotask(() => void loadAccounts());
  }, [loadAccounts]);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new");
    setMessage("");
    try {
      const response = await fetch("/api/auth/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password, role, customPermissions: [] }),
      });
      if (!response.ok) await handleFailure(response, "无法创建账户。");
      setUsername("");
      setName("");
      setPassword("");
      setRole("viewer");
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法创建账户。");
    } finally {
      setBusyId(null);
    }
  };

  const updateAccount = async (accountId: string, patch: Partial<Pick<AccountInfo, "name" | "role">>) => {
    setBusyId(accountId);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/accounts/${accountId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) await handleFailure(response, "无法更新账户。");
      const body = await responseBody(response);
      if (body.account) {
        setAccounts((current) => current.map((account) => account.id === accountId ? body.account! : account));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法更新账户。");
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!window.confirm("确定删除这个账户？现有会话将立即失效。")) return;
    setBusyId(accountId);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/accounts/${accountId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) await handleFailure(response, "无法删除账户。");
      setAccounts((current) => current.filter((account) => account.id !== accountId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法删除账户。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-section" aria-labelledby="accounts-title">
      <div className="section-heading">
        <div><p className="public-kicker">访问控制</p><h2 id="accounts-title">账户管理</h2></div>
        <button type="button" onClick={() => void loadAccounts()} disabled={loading}>刷新</button>
      </div>
      {message && <p className="form-error" role="alert">{message}</p>}
      {loading ? <p role="status">正在加载账户…</p> : accounts.length === 0 ? <p>尚无账户。</p> : (
        <ul className="account-list" aria-label="账户列表">
          {accounts.map((account) => (
            <li key={account.id} className="account-row">
              <div><strong>{account.name}</strong><span>@{account.username}</span></div>
              <label>角色
                <select value={account.role} disabled={busyId === account.id} onChange={(event) => void updateAccount(account.id, { role: event.target.value as Role })}>
                  <option value="viewer">viewer</option><option value="admin">admin</option><option value="super_admin">super_admin</option>
                </select>
              </label>
              <button className="danger-button" type="button" disabled={busyId === account.id} onClick={() => void deleteAccount(account.id)}>删除</button>
            </li>
          ))}
        </ul>
      )}
      <form className="account-form" onSubmit={createAccount} aria-labelledby="create-account-title">
        <h3 id="create-account-title">新增账户</h3>
        <label>用户名<input required maxLength={64} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>显示名称<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>初始密码<input required minLength={8} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>角色<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="viewer">viewer</option><option value="admin">admin</option><option value="super_admin">super_admin</option></select></label>
        <button className="primary-button" type="submit" disabled={busyId === "new"}>{busyId === "new" ? "创建中…" : "创建账户"}</button>
      </form>
    </section>
  );
}
