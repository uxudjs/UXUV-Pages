import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const rootUrl = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, rootUrl), "utf8");

test("T55 replaces the settings card with one authenticated-shell update control", () => {
  assert.equal(existsSync(new URL("components/AppUpdateControl.tsx", rootUrl)), true);
  const gate = read("components/PasswordGate.tsx");
  const settings = read("app/settings/page.tsx");
  const premium = read("components/premium/PremiumSettingsExperience.tsx");

  assert.equal((gate.match(/<AppUpdateControl\s*\/>/g) ?? []).length, 1);
  assert.match(gate, /className="application-shell"[\s\S]*<AppUpdateControl\s*\/>[\s\S]*\{children\}/);
  assert.doesNotMatch(settings, /AppVersionSettings|app-version/);
  assert.doesNotMatch(premium, /AppVersionSettings|app-version/);
});

test("T55 defines the five update states, safe copy path, and three localized dialogs", () => {
  const control = read("components/AppUpdateControl.tsx");
  for (const status of ["loading", "update-available", "up-to-date", "ahead-of-remote", "check-failed"]) {
    assert.match(control, new RegExp(`\\b${status}\\b`));
  }
  for (const locale of ["zh-CN", "zh-TW", "en"]) assert.match(control, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
  assert.match(control, /\/api\/app-update/);
  assert.match(control, /artifact=worker/);
  assert.match(control, /navigator\.clipboard\.writeText/);
  assert.match(control, /useDialogFocusTrap/);
  assert.match(control, /role="dialog"/);
  assert.match(control, /aria-modal="true"/);
  assert.match(control, /aria-live="polite"/);
  assert.doesNotMatch(control, /setInterval|animate-pulse|emoji/);
});

test("T55 keeps the approved six-domain settings order after moving version information out", () => {
  const settings = read("app/settings/page.tsx");
  const domains = ["account", "sources", "playback", "display", "sync", "data"]
    .map((domain) => settings.indexOf(`data-settings-domain="${domain}"`));
  assert.ok(domains.every((position) => position >= 0));
  assert.ok(domains.every((position, index) => index === 0 || position > domains[index - 1]));
  const usage = settings.indexOf("<CloudflareUsageSettings");
  assert.ok(usage > domains[4] && usage < domains[5]);
});

test("S21-T05 shares the safe-area corner token without motion-heavy update styling", () => {
  const control = read("components/AppUpdateControl.tsx");
  const syncStatus = read("components/SyncStatus.tsx");
  const styles = read("app/globals.css");
  assert.match(control, /app-update-corner/);
  assert.match(syncStatus, /sync-status-corner/);
  assert.match(styles, /\.app-update-trigger\s*\{[^}]*position:\s*fixed[^}]*top:\s*var\(--shell-edge-inset\)[^}]*right:\s*var\(--shell-edge-inset\)[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.sync-status\s*\{[^}]*top:\s*var\(--shell-edge-inset\)[^}]*left:\s*var\(--shell-edge-inset\)/s);
  assert.match(styles, /\.nav-user\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(styles, /app-update[^}]*animation:/s);
});
