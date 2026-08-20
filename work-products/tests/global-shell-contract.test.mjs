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
  const displayInitial = read("lib/utils/display-initial.ts");

  assert.match(navigation, /const settingsHref = premium \? "\/premium\/settings" : "\/settings"/);
  assert.match(navigation, /displayInitial\(auth\?\.session\.name, auth\?\.session\.username\)/);
  assert.match(displayInitial, /Array\.from\(value\)\[0\] \?\? "\?"/);
  assert.match(navigation, /<Link className="nav-user" href=\{settingsHref\}[^>]*aria-label=\{copy\.openSettings\}[^>]*>\{userInitial\}<\/Link>/s);
  assert.doesNotMatch(navigation, /<span className="nav-user"/);
  assert.doesNotMatch(navigation, /title=\{copy\.openSettings\}/);
});

test("S21-T05 keeps the brand on the logical root and delegates transient reset", () => {
  const navigation = read("components/ContentNavigation.tsx");
  assert.match(navigation, /onBrandActivate/);
  assert.match(navigation, /href="\/"/);
  assert.doesNotMatch(navigation, /href=\{premium \? "\/premium" : "\/"\}/);
});

test("activates bounded scroll restoration, back-to-top, and TV spatial focus", () => {
  const gate = read("components/PasswordGate.tsx");
  assert.match(gate, /ScrollPositionManager/);
  assert.match(gate, /TVNavigationInitializer/);
  assert.match(gate, /BackToTop/);
  assert.match(read("lib/hooks/useSpatialNavigation.ts"), /\[data-focusable\]/);
  assert.match(read("components/ScrollPositionManager.tsx"), /sessionStorage/);
});

test("S21-T06 centralizes bounded Liquid Glass materials and accessibility fallbacks", () => {
  const css = read("app/globals.css");
  for (const token of [
    "--shell-edge-inset", "--glass-regular-bg", "--glass-clear-bg", "--glass-opaque-bg",
    "--glass-border", "--glass-regular-sheen", "--glass-clear-sheen", "--glass-regular-shadow", "--glass-clear-shadow",
    "--control-radius", "--content-radius", "--control-hit-size", "--focus-ring-color",
  ]) assert.match(css, new RegExp(token), token);
  assert.match(css, /--glass-bg:\s*var\(--glass-opaque-bg\)/);
  assert.match(css, /\.liquid-glass-regular[\s\S]*backdrop-filter:\s*var\(--glass-regular-filter\)/);
  assert.match(css, /\.liquid-glass-clear[\s\S]*backdrop-filter:\s*var\(--glass-clear-filter\)/);
  assert.match(css, /\.liquid-glass-regular[\s\S]*background-image:\s*var\(--glass-regular-sheen\)[\s\S]*box-shadow:\s*var\(--glass-regular-shadow\)/);
  assert.match(css, /\.liquid-glass-clear[\s\S]*background-image:\s*var\(--glass-clear-sheen\)[\s\S]*box-shadow:\s*var\(--glass-clear-shadow\)/);
  for (const fallback of [
    /@supports not \(backdrop-filter:/,
    /prefers-reduced-transparency:\s*reduce\)[\s\S]*body,[\s\S]*--glass-regular-bg:\s*var\(--glass-opaque-bg\)[\s\S]*--glass-regular-filter:\s*none/,
    /prefers-contrast:\s*more\)[\s\S]*body,[\s\S]*--glass-border:\s*currentColor/,
    /forced-colors:\s*active\)[\s\S]*body,[\s\S]*--glass-regular-bg:\s*Canvas/,
  ]) assert.match(css, fallback);
  assert.doesNotMatch(css, /(?:^|\n)[ \t]*backdrop-filter:\s*blur\(/);
  assert.match(css, /\.nav-icon,[\s\S]*\.theme-switcher button,[\s\S]*min-width:\s*var\(--control-hit-size\)[\s\S]*min-height:\s*var\(--control-hit-size\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce\)[\s\S]*\.theme-switcher button\[aria-pressed="true"\][\s\S]*transform:\s*none\s*!important/);
  assert.doesNotMatch(css, /\.kvideo-result-card[^}]*backdrop-filter:\s*blur/s);
});
