import { AdminGate } from "@/components/AdminGate";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { CloudflareUsageSettings } from "@/components/settings/CloudflareUsageSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { DisplaySettings } from "@/components/settings/DisplaySettings";
import { PlayerSettings } from "@/components/settings/PlayerSettings";
import { SourceSettings } from "@/components/settings/SourceSettings";
import { SortSettings } from "@/components/settings/SortSettings";
import { SettingsAnchorNav, SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { SyncSettings } from "@/components/settings/SyncSettings";
import { UserDanmakuSettings } from "@/components/settings/UserDanmakuSettings";

export default function SettingsPage() {
  return (
    <div className="content-shell settings-page-shell">
      <main className="settings-shell">
        <SettingsPageHeading />
        <div className="settings-layout">
          <SettingsAnchorNav className="settings-anchor-nav" />
          <div className="settings-domain-list">
            <div id="settings-domain-account" className="settings-domain settings-domain-account" data-settings-domain="account">
              <AdminGate showFallback><AccountSettings /></AdminGate>
            </div>
            <div id="settings-domain-sources" className="settings-domain settings-domain-sources" data-settings-domain="sources">
              <SourceSettings />
              <UserDanmakuSettings />
            </div>
            <div id="settings-domain-playback" className="settings-domain settings-domain-playback" data-settings-domain="playback">
              <PlayerSettings />
            </div>
            <div id="settings-domain-display" className="settings-domain settings-domain-display" data-settings-domain="display">
              <DisplaySettings />
              <SortSettings />
            </div>
            <div id="settings-domain-sync" className="settings-domain settings-domain-sync" data-settings-domain="sync">
              <SyncSettings />
              <AdminGate><CloudflareUsageSettings /></AdminGate>
            </div>
            <div id="settings-domain-data" className="settings-domain settings-domain-data" data-settings-domain="data">
              <DataSettings />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
