import { AdminGate } from "@/components/AdminGate";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { CloudflareUsageSettings } from "@/components/settings/CloudflareUsageSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { DisplaySettings } from "@/components/settings/DisplaySettings";
import { PlayerSettings } from "@/components/settings/PlayerSettings";
import { SourceSettings } from "@/components/settings/SourceSettings";
import { SortSettings } from "@/components/settings/SortSettings";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { SyncSettings } from "@/components/settings/SyncSettings";
import { UserDanmakuSettings } from "@/components/settings/UserDanmakuSettings";
import { UserSourceSettings } from "@/components/settings/UserSourceSettings";

export default function SettingsPage() {
  return (
    <div className="content-shell settings-page-shell">
      <main className="settings-shell">
        <SettingsPageHeading />
        <AdminGate showFallback>
          <AccountSettings />
        </AdminGate>
        <AdminGate><CloudflareUsageSettings /></AdminGate>
        <SyncSettings />
        <PlayerSettings />
        <DisplaySettings />
        <UserSourceSettings />
        <UserDanmakuSettings />
        <SourceSettings />
        <SortSettings />
        <DataSettings />
      </main>
    </div>
  );
}
