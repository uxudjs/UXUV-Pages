import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T17 scopes theme, locale, and scroll restoration to the authenticated account", () => {
  const bridge = read("components/AccountPreferenceBridge.tsx");
  const theme = read("components/ThemeProvider.tsx");
  const locale = read("components/LocaleProvider.tsx");
  const scroll = read("components/ScrollPositionManager.tsx");
  assert.match(bridge, /updateConfigField\("theme"/);
  assert.match(bridge, /updateConfigField\("locale"/);
  assert.match(theme, /uxuv-theme:/);
  assert.match(locale, /uxuv-locale:/);
  assert.match(scroll, /rememberScrollPosition/);
  assert.match(scroll, /accountId/);
});

test("T17 restores the reviewed display and sort defaults through active consumers", () => {
  const display = read("components/settings/DisplaySettings.tsx");
  const sort = read("components/settings/SortSettings.tsx");
  const page = read("app/settings/page.tsx");
  const displayHook = read("lib/hooks/useSearchDisplayMode.ts");
  const searchHook = read("lib/hooks/useSearchResultPreferences.ts");
  for (const token of ["rememberScrollPosition", "realtimeLatency", "searchDisplayMode", "blockedCategories"]) assert.match(display, new RegExp(token));
  for (const option of ["default", "relevance", "latency-asc", "date-desc", "date-asc", "rating-desc", "name-asc", "name-desc"]) assert.match(sort, new RegExp(option));
  assert.match(page, /<DisplaySettings/);
  assert.match(page, /<SortSettings/);
  assert.match(displayHook, /uxuv-search-display-mode-change/);
  assert.match(searchHook, /uxuv-search-policy-change/);
});

test("T17 keeps all preference controls localized and keyboard operable", () => {
  const display = read("components/settings/DisplaySettings.tsx");
  const sort = read("components/settings/SortSettings.tsx");
  const switcher = read("components/ThemeSwitcher.tsx");
  for (const locale of ["zh-CN", "zh-TW", "en"]) {
    assert.match(display, new RegExp(`(?:"${locale}"|${locale}:)`));
    assert.match(sort, new RegExp(`(?:"${locale}"|${locale}:)`));
    assert.match(switcher, new RegExp(`(?:"${locale}"|${locale}:)`));
  }
  assert.match(display, /data-focusable/);
  assert.match(sort, /data-focusable/);
});

test("T55 renders locale choices as one direct three-column button group without helper copy", () => {
  const display = read("components/settings/DisplaySettings.tsx");
  const styles = read("app/globals.css");

  assert.match(display, /className="display-language-options"/);
  assert.match(display, /localeOptions\.map[\s\S]*<button[\s\S]*aria-pressed=\{locale === option\.value\}/);
  assert.doesNotMatch(display, /languageHint|simplifiedHint|traditionalHint|englishHint/);
  assert.doesNotMatch(display, /display-language-settings"><h3>\{copy\.language\}<\/h3><p>/);
  assert.match(styles, /\.display-language-options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.display-language-options\s+button\s*\{[^}]*min-height:\s*44px/s);
});

test("S21-T10 groups both settings surfaces into the same localized six-domain layout", () => {
  const standard = read("app/settings/page.tsx");
  const premium = read("components/premium/PremiumSettingsExperience.tsx");
  const heading = read("components/settings/SettingsPageHeading.tsx");
  const styles = read("app/globals.css");
  const domains = ["account", "sources", "playback", "display", "sync", "data"];
  for (const source of [standard, premium]) {
    let previous = -1;
    for (const domain of domains) {
      const index = source.indexOf(`settings-domain-${domain}`);
      assert.ok(index > previous, `${domain} must follow the preceding settings domain`);
      previous = index;
    }
    assert.match(source, /<SettingsAnchorNav className="settings-anchor-nav"/);
  }
  for (const domain of domains) assert.match(heading, new RegExp(`href=[{]?['\"]#settings-domain-${domain}`));
  for (const locale of ["zh-CN", "zh-TW", "en"]) assert.match(heading, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
  assert.match(styles, /\.settings-domain-list\s*\{/);
  assert.match(styles, /@media \(min-width:\s*1024px\)[\s\S]*\.settings-anchor-nav/);
  assert.match(styles, /\.settings-domain[\s\S]*:where\(button,\s*input,\s*select\)[^}]*min-height:\s*var\(--control-hit-size\)/);
});

test("S21-T10 keeps long settings copy in labeled rows and removes global skip editing", () => {
  const display = read("components/settings/DisplaySettings.tsx");
  const sort = read("components/settings/SortSettings.tsx");
  const player = read("components/settings/PlayerSettings.tsx");
  const danmaku = read("components/settings/UserDanmakuSettings.tsx");
  assert.match(display, /settings-field-row/);
  assert.match(display, /<span[^>]*>\{copy\.blocked\}<\/span>/);
  assert.match(sort, /<select/);
  assert.match(player, /playbackBehavior|networkPath|adFiltering|danmakuAppearance/);
  assert.match(player, /settings-field-row/);
  assert.match(player, /<span[^>]*>\{copy\.keywordPlaceholder\}<\/span>/);
  assert.doesNotMatch(player, /autoSkipIntro|skipIntroSeconds|autoSkipOutro|skipOutroSeconds/);
  assert.match(danmaku, /<span[^>]*>\{copy\.name\}<\/span>/);
  assert.match(danmaku, /<span[^>]*>\{copy\.url\}<\/span>/);
});
