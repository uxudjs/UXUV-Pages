import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("guards GitHub Pages before authentication and keeps sessions cookie-only", () => {
  for (const path of [
    "lib/store/auth-store.ts",
    "components/PasswordGate.tsx",
    "components/AdminGate.tsx",
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const store = read("lib/store/auth-store.ts");
  const gate = read("components/PasswordGate.tsx");
  const runtime = read("components/RuntimeConfigProvider.tsx");
  const layout = read("app/layout.tsx");
  const combined = `${store}\n${gate}\n${runtime}\n${layout}`;

  assert.match(store, /hostname\.toLowerCase\(\)\.endsWith\(["']\.github\.io["']\)/);
  assert.match(runtime, /if \(isDirectPagesHost\(window\.location\.hostname\)\)/);
  assert.ok(
    runtime.indexOf("isDirectPagesHost(window.location.hostname)") < runtime.indexOf('fetch("/api/config"'),
    "direct Pages detection must happen before any authentication request",
  );
  assert.match(gate, /fetch\(["']\/api\/auth\/session["']/);
  assert.match(gate, /credentials:\s*["']same-origin["']/);
  assert.match(gate, /useRuntimeConfig\(\)/);
  assert.match(layout, /<PasswordGate>[\s\S]*\{children\}[\s\S]*<\/PasswordGate>/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|Authorization\s*:/);
});

test("builds the reviewed KVideo login from only its used Liquid Glass primitives", () => {
  for (const path of [
    "components/ui/Button.tsx",
    "components/ui/Input.tsx",
    "components/ui/Icon.tsx",
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const gate = read("components/PasswordGate.tsx");
  const localeProvider = read("components/LocaleProvider.tsx");
  const button = read("components/ui/Button.tsx");
  const input = read("components/ui/Input.tsx");
  const icon = read("components/ui/Icon.tsx");
  const css = read("app/globals.css");

  assert.match(gate, /from ["']@\/components\/ui\/Button["']/);
  assert.match(gate, /from ["']@\/components\/ui\/Input["']/);
  assert.match(gate, /from ["']@\/components\/ui\/Icon["']/);
  assert.match(localeProvider, /navigator\.language/);
  assert.match(gate, /credentials:\s*["']same-origin["']/);
  assert.match(gate, /autoComplete=["']username["']/);
  assert.match(gate, /autoComplete=["']current-password["']/);
  assert.match(button, /auth-submit/);
  assert.match(input, /auth-input/);
  assert.match(icon, /lucide-react/);
  for (const token of ["--bg-color", "--text-color", "--accent-color", "--glass-bg", "--glass-border", "--radius-2xl"]) {
    assert.match(css, new RegExp(token));
  }
  assert.doesNotMatch(`${gate}\n${button}\n${input}\n${icon}`, /localStorage|sessionStorage|Authorization\s*:/);
});

test("uses relative account APIs and exposes management only to super_admin", () => {
  const adminGate = read("components/AdminGate.tsx");
  const settings = read("components/settings/AccountSettings.tsx");

  assert.match(adminGate, /session\?\.role !== ["']super_admin["']/);
  assert.match(settings, /fetch\(["']\/api\/auth\/accounts["']/);
  assert.match(settings, /`\/api\/auth\/accounts\/\$\{accountId\}`/);
  assert.match(settings, /method:\s*["']POST["']/);
  assert.match(settings, /method:\s*["']PATCH["']/);
  assert.match(settings, /method:\s*["']DELETE["']/);
  assert.doesNotMatch(settings, /passwordHash|passwordSalt|token|localStorage|sessionStorage/);
});

test("T13 assigns readable material to authentication surfaces and keeps nested controls single-layer", () => {
  const gate = read("components/PasswordGate.tsx");
  const publicPage = read("components/PublicPage.tsx");
  const theme = read("components/ThemeSwitcher.tsx");
  const together = read("components/VideoTogetherController.tsx");
  const css = read("app/globals.css");

  assert.match(gate, /className="auth-card"[^>]*data-material="regular"/s);
  assert.match(gate, /className="public-notice"[^>]*data-material="regular"/s);
  assert.match(publicPage, /className="public-notice"[^>]*data-material="regular"/s);
  assert.match(theme, /className="theme-switcher"[^>]*data-material="clear"/s);
  assert.match(together, /className="desktop-speed-trigger video-together-trigger"[^>]*data-material="clear"/s);
  assert.match(together, /className="source-modal video-together-dialog"[^>]*data-material="regular"/s);
  assert.match(css, /\[data-material="regular"\]/);
  assert.match(css, /\[data-material="clear"\]/);
  assert.match(css, /\[data-material="regular"\][^{}]*\[data-material="(?:regular|clear)"\][^{]*\{[^}]*backdrop-filter:\s*none/s);
});
