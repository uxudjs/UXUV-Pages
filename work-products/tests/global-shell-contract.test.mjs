import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("wraps every static entry in the used theme and locale providers", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /ThemeProvider/);
  assert.match(layout, /LocaleProvider/);
  assert.match(read("components/ThemeProvider.tsx"), /uxuv-theme/);
  assert.match(read("components/LocaleProvider.tsx"), /uxuv-locale/);
});

test("renders one KVideo navigation shell with theme and session actions", () => {
  const navigation = read("components/ContentNavigation.tsx");
  assert.match(navigation, /ThemeSwitcher/);
  assert.match(navigation, /useLocale/);
  assert.match(navigation, /data-focusable/);
  assert.match(navigation, /signOut/);
  assert.doesNotMatch(read("components/PasswordGate.tsx"), /session-bar/);
});

test("T54 uses a direct-text Unicode-safe user initial as the settings link", () => {
  const navigation = read("components/ContentNavigation.tsx");

  assert.match(navigation, /const settingsHref = premium \? "\/premium\/settings" : "\/settings"/);
  assert.match(navigation, /\.name\.trim\(\).*\.username\.trim\(\)/s);
  assert.match(navigation, /Array\.from\([^)]*\)\[0\] \?\? "\?"/);
  assert.match(navigation, /<Link className="nav-user" href=\{settingsHref\}[^>]*aria-label=\{copy\.openSettings\}[^>]*>\{userInitial\}<\/Link>/s);
  assert.doesNotMatch(navigation, /<span className="nav-user"/);
  assert.doesNotMatch(navigation, /title=\{copy\.openSettings\}/);
});

test("activates bounded scroll restoration, back-to-top, and TV spatial focus", () => {
  const gate = read("components/PasswordGate.tsx");
  assert.match(gate, /ScrollPositionManager/);
  assert.match(gate, /TVNavigationInitializer/);
  assert.match(gate, /BackToTop/);
  assert.match(read("lib/hooks/useSpatialNavigation.ts"), /\[data-focusable\]/);
  assert.match(read("components/ScrollPositionManager.tsx"), /sessionStorage/);
});
