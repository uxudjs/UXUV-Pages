"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";
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

const COPY = {
  "zh-CN": {
    title: "账户管理", description: "管理可访问此 Worker 的账户、角色和初始凭据。", refresh: "刷新", loading: "正在加载账户…",
    empty: "尚无账户。", list: "账户列表", role: "角色", remove: "删除", add: "新增账户", username: "用户名",
    name: "显示名称", password: "初始密码", create: "创建账户", creating: "创建中…", confirmTitle: "删除这个账户？",
    confirmBody: "现有会话将立即失效。此操作无法撤销。", cancel: "取消", confirm: "确认删除",
    loadError: "无法读取账户。", createError: "无法创建账户。", updateError: "无法更新账户。", deleteError: "无法删除账户。",
  },
  "zh-TW": {
    title: "帳戶管理", description: "管理可存取此 Worker 的帳戶、角色與初始憑證。", refresh: "重新整理", loading: "正在載入帳戶…",
    empty: "尚無帳戶。", list: "帳戶清單", role: "角色", remove: "刪除", add: "新增帳戶", username: "使用者名稱",
    name: "顯示名稱", password: "初始密碼", create: "建立帳戶", creating: "建立中…", confirmTitle: "刪除此帳戶？",
    confirmBody: "現有工作階段將立即失效。此操作無法復原。", cancel: "取消", confirm: "確認刪除",
    loadError: "無法讀取帳戶。", createError: "無法建立帳戶。", updateError: "無法更新帳戶。", deleteError: "無法刪除帳戶。",
  },
  en: {
    title: "Account management", description: "Manage the accounts, roles, and initial credentials that can access this Worker.", refresh: "Refresh", loading: "Loading accounts…",
    empty: "No accounts yet.", list: "Account list", role: "Role", remove: "Delete", add: "Add account", username: "Username",
    name: "Display name", password: "Initial password", create: "Create account", creating: "Creating…", confirmTitle: "Delete this account?",
    confirmBody: "Existing sessions will expire immediately. This action cannot be undone.", cancel: "Cancel", confirm: "Delete account",
    loadError: "Unable to load accounts.", createError: "Unable to create the account.", updateError: "Unable to update the account.", deleteError: "Unable to delete the account.",
  },
} as const;

async function responseBody(response: Response): Promise<AccountsResponse> {
  try { return await response.json() as AccountsResponse; } catch { return {}; }
}

export function AccountSettings() {
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [pendingDelete, setPendingDelete] = useState<AccountInfo | null>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const deleteReturnRef = useRef<HTMLButtonElement>(null);
  const closeDelete = useCallback(() => setPendingDelete(null), []);
  useDialogFocusTrap({ open: pendingDelete !== null, dialogRef: deleteDialogRef, returnFocusRef: deleteReturnRef, onEscape: closeDelete });

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
      if (!response.ok) await handleFailure(response, copy.loadError);
      const body = await responseBody(response);
      setAccounts(body.accounts ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, handleFailure]);

  useEffect(() => { queueMicrotask(() => void loadAccounts()); }, [loadAccounts]);

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new");
    setMessage("");
    try {
      const response = await fetch("/api/auth/accounts", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password, role, customPermissions: [] }),
      });
      if (!response.ok) await handleFailure(response, copy.createError);
      setUsername(""); setName(""); setPassword(""); setRole("viewer");
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.createError);
    } finally {
      setBusyId(null);
    }
  };

  const updateAccount = async (accountId: string, patch: Partial<Pick<AccountInfo, "name" | "role">>) => {
    setBusyId(accountId);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/accounts/${accountId}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!response.ok) await handleFailure(response, copy.updateError);
      const body = await responseBody(response);
      if (body.account) setAccounts((current) => current.map((account) => account.id === accountId ? body.account! : account));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updateError);
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async () => {
    if (!pendingDelete) return;
    const accountId = pendingDelete.id;
    setBusyId(accountId);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/accounts/${accountId}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) await handleFailure(response, copy.deleteError);
      setAccounts((current) => current.filter((account) => account.id !== accountId));
      setPendingDelete(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.deleteError);
    } finally {
      setBusyId(null);
    }
  };

  return <SettingsSection id="accounts" title={copy.title} description={copy.description} summary={
    <button type="button" data-focusable onClick={() => void loadAccounts()} disabled={loading}>{copy.refresh}</button>
  }>
    {message && <p className="form-error" role="alert">{message}</p>}
    {loading ? <p role="status">{copy.loading}</p> : accounts.length === 0 ? <p>{copy.empty}</p> : (
      <ul className="account-list" aria-label={copy.list}>
        {accounts.map((account) => <li key={account.id} className="account-row">
          <div><strong>{account.name}</strong><span>@{account.username}</span></div>
          <label>{copy.role}<select data-focusable value={account.role} disabled={busyId === account.id}
            onChange={(event) => void updateAccount(account.id, { role: event.target.value as Role })}>
            <option value="viewer">viewer</option><option value="admin">admin</option><option value="super_admin">super_admin</option>
          </select></label>
          <button className="danger-button" type="button" data-focusable disabled={busyId === account.id} onClick={(event) => {
            deleteReturnRef.current = event.currentTarget;
            setPendingDelete(account);
          }}>{copy.remove}</button>
        </li>)}
      </ul>
    )}
    <form className="account-form" onSubmit={createAccount} aria-labelledby="create-account-title">
      <h3 id="create-account-title">{copy.add}</h3>
      <label>{copy.username}<input data-focusable required maxLength={64} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>{copy.name}<input data-focusable required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.password}<input data-focusable required minLength={8} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>{copy.role}<select data-focusable value={role} onChange={(event) => setRole(event.target.value as Role)}>
        <option value="viewer">viewer</option><option value="admin">admin</option><option value="super_admin">super_admin</option>
      </select></label>
      <button className="primary-button" type="submit" data-focusable disabled={busyId === "new"}>{busyId === "new" ? copy.creating : copy.create}</button>
    </form>
    {pendingDelete && <><button type="button" className="collection-confirm-backdrop" aria-label={copy.cancel} onClick={closeDelete} />
      <section ref={deleteDialogRef} className="collection-confirm" role="alertdialog" aria-modal="true" aria-labelledby="account-delete-title">
        <h3 id="account-delete-title">{copy.confirmTitle}</h3><p><strong>{pendingDelete.name}</strong> — {copy.confirmBody}</p><div>
          <button type="button" data-autofocus data-focusable onClick={closeDelete}>{copy.cancel}</button>
          <button type="button" className="danger-button" data-focusable disabled={busyId === pendingDelete.id}
            onClick={() => void deleteAccount()}>{copy.confirm}</button>
        </div></section></>}
  </SettingsSection>;
}
