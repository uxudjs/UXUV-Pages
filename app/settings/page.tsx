import { AdminGate } from "@/components/AdminGate";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { CloudflareUsageSettings } from "@/components/settings/CloudflareUsageSettings";
import { SourceSettings } from "@/components/settings/SourceSettings";
import { SyncSettings } from "@/components/settings/SyncSettings";

export default function SettingsPage() {
  return (
    <main className="settings-shell">
      <header className="page-heading"><p className="public-kicker">UXUVideo</p><h1>设置</h1><p>账户与权限由当前 Worker 安全管理。</p></header>
      <AdminGate fallback={<section className="settings-section"><h2>账户管理</h2><p>只有 super_admin 可以查看和修改账户。</p></section>}>
        <AccountSettings />
      </AdminGate>
      <AdminGate><CloudflareUsageSettings /></AdminGate>
      <SyncSettings />
      <SourceSettings />
    </main>
  );
}
