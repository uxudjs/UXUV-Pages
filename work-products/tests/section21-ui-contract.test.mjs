import strictAssert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pathFor = (path) => join(root, path);
const read = (path) => readFileSync(pathFor(path), 'utf8');
let activeFailures = null;
const assert = new Proxy(strictAssert, {
  get(target, property) {
    const value = Reflect.get(target, property);
    if (typeof value !== 'function') return value;
    return (...arguments_) => {
      try {
        return value(...arguments_);
      } catch (error) {
        if (!activeFailures) throw error;
        activeFailures.push(error);
        return undefined;
      }
    };
  },
});

function contract(name, run) {
  test(name, () => {
    const failures = [];
    activeFailures = failures;
    try {
      run();
    } finally {
      activeFailures = null;
    }
    if (failures.length > 0) {
      const details = failures.map((error, index) => `[${index + 1}] ${error.message}`).join('\n');
      throw new Error(`${name}: ${failures.length} independent contract failures\n${details}`);
    }
  });
}

contract('S21-T05 uses the logical root, resets transient home search, and never syncs on focus', () => {
  assert.doesNotMatch(read('next.config.ts'), /basePath\s*:/);
  assert.doesNotMatch(read('components/SyncProvider.tsx'), /addEventListener\(["']focus["']/);
  if (existsSync(pathFor('components/RuntimeSourceSync.tsx'))) {
    assert.doesNotMatch(read('components/RuntimeSourceSync.tsx'), /addEventListener\(["']focus["']/);
  }
  assert.match(read('components/HomeExperience.tsx'), /onBrandActivate=\{clearSearch\}/);
  assert.match(read('components/ContentNavigation.tsx'), /onBrandActivate/);
  assert.doesNotMatch(read('components/HomeExperience.tsx'), /Continue watching|继续观看|繼續觀看/);
  assert.match(read('components/SyncStatus.tsx'), /3_000/);
  assert.match(read('components/SyncStatus.tsx'), /sync-status-corner/);
  assert.match(read('components/SyncStatus.tsx'), /usePathname/);
  assert.match(read('components/SyncStatus.tsx'), /sync-status-settings-route/);
  assert.match(read('app/globals.css'), /\.sync-status-settings-route\s*\{[^}]*position:\s*relative[^}]*top:\s*auto[^}]*left:\s*auto[^}]*margin:\s*calc\(var\(--shell-edge-inset\) \+ var\(--control-hit-size\) \+ \.5rem\) auto 0/s);
  assert.match(read('components/AppUpdateControl.tsx'), /app-update-corner/);
});

contract('S21-T06 defines bounded Liquid Glass tokens and opaque accessibility fallbacks', () => {
  const css = read('app/globals.css');
  for (const token of [
    '--shell-edge-inset', '--glass-regular-bg', '--glass-clear-bg', '--glass-border',
    '--glass-regular-sheen', '--glass-clear-sheen', '--glass-regular-shadow', '--glass-clear-shadow',
    '--control-radius', '--content-radius', '--control-hit-size',
  ]) assert.match(css, new RegExp(token));
  assert.match(css, /--glass-bg:\s*var\(--glass-opaque-bg\)/);
  assert.match(css, /\.kvideo-settings-section\s*\{[^}]*background:\s*var\(--glass-bg\)/s);
  assert.match(css, /\.player-shell\s*\{[^}]*background-image:\s*var\(--bg-image\)/s);
  assert.match(css, /\.content-shell\.premium-settings-page\s*\{[^}]*background-image:\s*var\(--bg-image\)/s);
  assert.match(css, /\.content-shell\.premium-legacy-shell\s*\{[^}]*background-image:\s*var\(--bg-image\)/s);
  assert.match(css, /\.content-nav-glass,[\s\S]*background-image:\s*var\(--glass-regular-sheen\)[\s\S]*box-shadow:\s*var\(--glass-regular-shadow\)/);
  assert.match(css, /\.liquid-glass-clear,[\s\S]*background-image:\s*var\(--glass-clear-sheen\)[\s\S]*box-shadow:\s*var\(--glass-clear-shadow\)/);
  assert.match(css, /@supports not \(backdrop-filter:/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-transparency/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.doesNotMatch(css, /\.kvideo-result-card[^}]*backdrop-filter:\s*blur/s);
});

contract('S21-T07 groups by title, type family, and year and defaults the compact toolbar closed', () => {
  const policy = read('lib/utils/search-result-policy.ts');
  const grid = read('components/search/VideoGrid.tsx');
  const controls = read('components/search/SearchResultControls.tsx');
  assert.match(policy, /export function searchGroupKey/);
  assert.match(policy, /movie[^\n]+tv[^\n]+anime[^\n]+variety[^\n]+documentary[^\n]+other[^\n]+unknown/s);
  assert.match(policy, /normalize\(["']NFC["']\)/);
  assert.match(policy, /\\0/);
  assert.match(grid, /groupSearchVideos/);
  assert.doesNotMatch(grid, /new Map<string, GroupedVideo>/);
  assert.match(controls, /useState\(false\)/);
  assert.match(controls, /aria-expanded=\{expanded\}/);
  assert.match(controls, /kvideo-result-controls-toggle/);
  assert.match(controls, /kvideo-block-category-compact/);
});

contract('S21-T08 removes runtime defaults and IPTV while preserving shared HLS compatibility', () => {
  for (const path of ['app/iptv/page.tsx', 'components/IptvExperience.tsx', 'components/RuntimeSourceSync.tsx', 'components/iptv', 'lib/iptv']) {
    assert.equal(existsSync(pathFor(path)), false, `${path} must be retired`);
  }
  const runtime = read('components/RuntimeConfigProvider.tsx');
  assert.doesNotMatch(runtime, /subscriptionSources|iptvSources|danmakuApiUrl|capabilities:\s*\{[^}]*iptv/s);
  assert.equal(existsSync(pathFor('lib/player/hls-compatibility.ts')), true);
  assert.match(read('components/player/hooks/useHlsPlayer.ts'), /@\/lib\/player\/hls-compatibility/);
  const packageJson = read('package.json');
  assert.match(packageJson, /node --test work-products\/tests\/section21-ui-contract\.test\.mjs/);
  assert.match(packageJson, /iptv-retirement-contract\.test\.mjs/);
  assert.match(packageJson, /hls-compatibility\.test\.mjs/);
  assert.doesNotMatch(packageJson, /iptv-(?:browse|playback|playlist|source)/);
});

contract('S21-T09 exposes one user-owned source and danmaku management surface', () => {
  const normal = read('app/settings/page.tsx');
  const premium = read('app/premium/settings/page.tsx');
  const sources = read('components/settings/SourceSettings.tsx');
  const danmaku = read('components/settings/UserDanmakuSettings.tsx');
  assert.doesNotMatch(`${normal}\n${premium}`, /UserSourceSettings/);
  assert.match(sources, /onResyncSubscription|resyncSubscription/);
  assert.doesNotMatch(sources, /copy\.system|copy\.personal|restoreDefaults/);
  assert.doesNotMatch(danmaku, /useRuntimeConfig|systemUrl|Use system default|使用系统默认|使用系統預設/);
  assert.match(danmaku, /danmaku-api-empty/);
});

contract('S21-T10 renders the same six settings domains without global skip controls', () => {
  for (const path of ['app/settings/page.tsx', 'components/premium/PremiumSettingsExperience.tsx']) {
    const page = read(path);
    for (const domain of ['account', 'sources', 'playback', 'display', 'sync', 'data']) {
      assert.match(page, new RegExp(`settings-domain-${domain}`));
    }
    assert.match(page, /settings-anchor-nav/);
  }
  const playerSettings = read('components/settings/PlayerSettings.tsx');
  assert.doesNotMatch(playerSettings, /autoSkipIntro|skipIntroSeconds|autoSkipOutro|skipOutroSeconds/);
  assert.match(read('app/globals.css'), /@media \(min-width:\s*1024px\)[\s\S]*settings-anchor-nav/);
});

contract('S21-T11 stores bounded per-video skip rules and edits them in the player', () => {
  const documentTypes = read('lib/sync/document-types.ts');
  const autoSkip = read('lib/player/auto-skip.ts');
  const player = read('components/PlayerExperience.tsx');
  assert.match(documentTypes, /interface VideoSkipRule/);
  assert.match(documentTypes, /videoSkipRules/);
  assert.match(autoSkip, /MAX_VIDEO_SKIP_RULES\s*=\s*200/);
  assert.match(autoSkip, /videoSkipRuleKey/);
  assert.match(autoSkip, /pruneVideoSkipRules/);
  assert.match(player, /SkipRuleEditor/);
  assert.match(player, /mode[^\n]+source[^\n]+videoId/);
});

contract('S21-T12 moves favorites and user settings into one-width player chrome', () => {
  const experience = read('components/PlayerExperience.tsx');
  const navbar = read('components/player/PlayerNavbar.tsx');
  const episodes = read('components/player/EpisodeList.tsx');
  const backToTop = read('components/ui/BackToTop.tsx');
  assert.doesNotMatch(experience, /<PlayerFavoriteButton/);
  assert.match(navbar, /PlayerFavoriteButton/);
  assert.match(navbar, /displayInitial/);
  assert.doesNotMatch(navbar, /Settings|locale-control|setLocale/);
  assert.match(episodes, /onKeyDown/);
  assert.match(episodes, /scrollIntoView/);
  assert.match(episodes, /shiftKey/);
  assert.match(backToTop, /player-web-fullscreen-open/);
  assert.match(read('app/globals.css'), /--player-content-width/);
});

contract('S21-T13 marks remaining navigation and overlay surfaces with material roles', () => {
  assert.match(read('package.json'), /section21-ui-contract\.test\.mjs/);
  for (const path of [
    'components/PasswordGate.tsx', 'components/PublicPage.tsx', 'components/FavoritesExperience.tsx',
    'components/favorites/FavoritesSidebar.tsx', 'components/history/WatchHistorySidebar.tsx',
    'components/premium/PremiumExperience.tsx', 'components/premium/PremiumSettingsExperience.tsx',
    'components/ThemeSwitcher.tsx', 'components/VideoTogetherController.tsx',
  ]) assert.match(read(path), /data-material=["'](?:regular|clear)["']/);
});

contract('S21-T15 keeps routine E2E runs away from the visual approval candidate', () => {
  for (const path of [
    'work-products/tests/accessibility.e2e.spec.ts',
    'work-products/tests/kvideo-player-shell.e2e.spec.ts',
    'work-products/tests/kvideo-search-results.e2e.spec.ts',
    'work-products/tests/section21-visual.e2e.spec.ts',
  ]) {
    const producer = read(path);
    assert.match(producer, /process\.env\.UXUV_WRITE_VISUAL_CANDIDATE\s*===\s*["']1["']/);
    assert.match(producer, /section21-candidate-draft/);
  }
});
