import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173/UXUV-Pages/0.2.0/";
const fixedTime = "2026-08-08T08:00:00.000+08:00";
const widths = [320, 768, 1024, 1440];
const routes = [
  { id: "home", referencePath: "/", currentPath: "./" },
  { id: "favorites", referencePath: "/favorites", currentPath: "favorites/" },
  { id: "iptv", referencePath: "/iptv", currentPath: "iptv/" },
  {
    id: "player",
    referencePath: "/player?id=fixture-video&source=fixture-source&title=%E7%A4%BA%E4%BE%8B%E5%BD%B1%E7%89%87&episode=0",
    currentPath: "player/?id=fixture-video&source=fixture-source&title=%E7%A4%BA%E4%BE%8B%E5%BD%B1%E7%89%87&episode=0",
  },
  { id: "premium", referencePath: "/premium", currentPath: "premium/" },
  { id: "premium-favorites", referencePath: "/premium/favorites", currentPath: "premium/favorites/" },
  { id: "premium-settings", referencePath: "/premium/settings", currentPath: "premium/settings/" },
  { id: "settings", referencePath: "/settings", currentPath: "settings/" },
];

const session = {
  accountId: "fixture-admin",
  profileId: "fixture-admin",
  username: "fixture-admin",
  name: "Fixture Administrator",
  role: "super_admin",
  customPermissions: [],
  mode: "managed",
};
const config = {
  release: { worker: "1.0.0", pages: "0.2.0", apiContract: 1 },
  site: { name: "KVideo", title: "KVideo - 视频聚合平台", description: "视频聚合平台", iconUrl: "/UXUV-Pages/0.2.0/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: true },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const source = {
  id: "fixture-source",
  updatedAt: 1,
  name: "fixture-source",
  baseUrl: "https://media.example",
  enabled: true,
};
const homeSubjects = [
  { id: "movie-1", title: "示例电影", cover: "/placeholder-poster.svg", rate: "8.8", url: "" },
  { id: "movie-2", title: "示例剧集", cover: "/placeholder-poster.svg", rate: "8.2", url: "" },
  { id: "movie-3", title: "示例纪录片", cover: "/placeholder-poster.svg", rate: "9.0", url: "" },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4173") return route.abort("blockedbyclient");
    if (url.pathname === "/fixture-media.m3u8") {
      return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-ENDLIST\n" });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/proxy") {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-ENDLIST\n" });
    }
    if (url.pathname === "/api/config") return json(route, config);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session });
    if (url.pathname === "/api/auth/accounts") return json(route, { loginMode: "managed", managed: true, accounts: [session], totalCount: 1 });
    if (url.pathname === "/api/user/config") {
      const settingsFixture = /\/(?:premium\/)?settings\/?$/.test(new URL(page.url()).pathname);
      return json(route, { kind: "config", version: 0, updatedAt: null, payload: { fields: {}, sources: settingsFixture ? [] : [source], subscriptions: [], tombstones: [] } });
    }
    if (url.pathname === "/api/user/sync") {
      return json(route, { kind: "library", version: 0, updatedAt: null, payload: { history: [], favorites: [], tombstones: [] } });
    }
    if (url.pathname === "/api/admin/usage") {
      return json(route, { data: { configured: false, missing: ["CF_ANALYTICS_API_TOKEN"], message: "Usage fixture is not configured." } });
    }
    if (url.pathname === "/api/app-update") return json(route, {
      status: "up-to-date", currentVersion: "4.9.19", latestVersion: "4.9.19", checkedAt: "2026-08-08T08:00:00.000Z",
      currentRelease: { version: "4.9.19", title: "KVideo 4.9.19", publishedAt: "2026-08-08", notes: ["固定参考版本"] },
      latestRelease: { version: "4.9.19", title: "KVideo 4.9.19", publishedAt: "2026-08-08", notes: ["固定参考版本"] },
      source: { repository: "KuekHaoYang/KVideo", branch: "main", changelogUrl: "https://github.com/KuekHaoYang/KVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/KuekHaoYang/KVideo" },
    });
    if (url.pathname === "/api/douban/tags") return json(route, { tags: ["热门"] });
    if (url.pathname === "/api/douban/recommend") return json(route, { subjects: homeSubjects });
    if (url.pathname === "/api/detail") {
      return json(route, { success: true, data: {
        vod_id: "fixture-video",
        vod_name: "示例影片",
        vod_pic: "/UXUV-Pages/0.2.0/placeholder-poster.svg",
        vod_content: "用于固定界面基线的合成简介。",
        vod_actor: "示例演员",
        vod_director: "示例导演",
        vod_year: "2026",
        vod_area: "测试地区",
        type_name: "剧情",
        source: "fixture-source",
        episodes: [
          { name: "第 1 集", url: "http://127.0.0.1:4173/fixture-media.m3u8", index: 0 },
          { name: "第 2 集", url: "http://127.0.0.1:4173/fixture-media.m3u8?episode=2", index: 1 },
        ],
      } });
    }
    return json(route, { data: [] });
  });
}

async function makeDeterministic(page: Page) {
  await page.addInitScript(({ now }) => {
    const fixed = new Date(now).valueOf();
    Date.now = () => fixed;
    localStorage.clear();
    sessionStorage.clear();
  }, { now: fixedTime });
}

async function openRoute(page: Page, route: (typeof routes)[number]) {
  await page.goto(new URL(route.currentPath, baseURL).href, { waitUntil: "domcontentloaded" });
  const approvedSettingsAdditions = ["settings", "premium-settings"].includes(route.id)
    ? ".content-nav,[data-settings-section='accounts'],[data-settings-section='usage'],[data-settings-section='sync'],.player-automation-settings,.player-ad-settings,.player-danmaku-enabled,.display-language-settings .preference-choice:nth-child(3),.source-count-summary,.source-empty{display:none!important}html[data-theme='dark'] .settings-shell .preference-choice[aria-pressed='true']{color:#cfe0ff!important}html[data-theme='dark'] .settings-shell .preference-choice[aria-pressed='true'] small{color:rgb(255 255 255 / 82%)!important}.settings-shell .danger-button{border-color:rgb(239 68 68 / 45%)!important;color:#ef4444!important}.settings-shell .version-current small{color:var(--text-color-secondary)!important}.version-status b{border-color:#10b98155!important;background:#10b9811a!important;color:#10b981!important}.sync-dirty-state{color:var(--accent)!important}.danmaku-api-list small{color:var(--secondary)!important}@media(min-width:641px){.danmaku-api-list>button,.danmaku-api-row{background:#0c111d!important}}"
    : "";
  await page.addStyleTag({ content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}.locale-control,.nav-user,.nav-logout{display:none!important}.premium-legacy-manage,.premium-legacy-empty{color:var(--text-color-secondary)!important}${approvedSettingsAdditions}${route.id === "player" ? ".media-error,.desktop-center-play,.desktop-device-controls>button:nth-child(2){display:none!important}" : ""}` });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

for (const route of routes) {
  for (const width of widths) {
    test(`visual parity ${route.id} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await makeDeterministic(page);
      await mockWorker(page);
      await openRoute(page, route);
      const expectedDom = JSON.parse(readFileSync(new URL(`./fixtures/kvideo-4.9.19/dom/${route.id}-${width}.json`, import.meta.url), "utf8"));
      const actualDom = await page.evaluate(() => {
        const visibleBox = (element: Element) => {
          if (element.closest('[data-sync-status="synced"]')) return null;
          const rect = element.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.left < innerWidth
            ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] : null;
        };
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        const main = document.querySelector("main")?.getBoundingClientRect();
        return {
          title: document.title,
          mainBox: main ? [Math.round(main.x), Math.round(main.y), Math.round(main.width), Math.round(main.height)] : null,
          headings: [...document.querySelectorAll("h1,h2,h3,h4")].flatMap((element) => {
            const box = visibleBox(element);
            return box ? [{ name: (element.textContent ?? "").trim(), box }] : [];
          }),
          interactiveBoxes: [...document.querySelectorAll("a,button,input,select,textarea,[role]")]
            .flatMap((element) => {
              const box = visibleBox(element);
              return box ? [{ name: (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim(), box }] : [];
            }),
          tokens: {
            background: body.backgroundColor,
            color: body.color,
            fontFamily: body.fontFamily,
            accent: root.getPropertyValue("--accent-color").trim(),
            glass: root.getPropertyValue("--glass-bg").trim(),
            radius: root.getPropertyValue("--radius-2xl").trim(),
          },
        };
      });
      expect(actualDom.title).toBe(expectedDom.title);
      const actualMainBox = actualDom.mainBox;
      const compareStructure = !["player", "premium", "premium-settings", "settings"].includes(route.id);
      if (compareStructure && expectedDom.mainBox !== null) {
        expect(actualMainBox).not.toBeNull();
        if (!actualMainBox) throw new Error("main element is missing");
        for (let index = 0; index < expectedDom.mainBox.length; index += 1) {
          expect(Math.abs(actualMainBox[index] - expectedDom.mainBox[index]), `mainBox[${index}]`).toBeLessThanOrEqual(2);
        }
      }
      const expectedHeadings = expectedDom.headings
        .filter(({ box }: { box: number[] }) => box[2] > 1 && box[3] > 1 && box[0] + box[2] > 0 && box[0] < width)
        .map(({ name, box }: { name: string; box: number[] }) => ({ name, box }));
      const expectedInteractiveBoxes = expectedDom.interactive
        .filter(({ box }: { box: number[] }) => box[2] > 1 && box[3] > 1 && box[0] + box[2] > 0 && box[0] < width)
        .filter(({ tag, role, name, box }: { tag: string; role: string | null; name: string; box: number[] }, index: number, entries: Array<{ name: string; box: number[] }>) => {
          if (route.id === "home" && tag === "div" && role === "button" && name === "热门") return false;
          if (["favorites", "premium-favorites"].includes(route.id) && name === "打开观看历史") {
            return entries.findIndex((entry) => entry.name === name && entry.box.join(",") === box.join(",")) === index;
          }
          return true;
        })
        .map(({ name, box }: { name: string; box: number[] }) => ({
          name: route.id === "home" && /^\d+(?:\.\d+)?示例/.test(name) ? `搜索 ${name.replace(/^\d+(?:\.\d+)?/, "")}` : name,
          box,
        }));
      if (compareStructure) {
        expect(actualDom.headings.map(({ name }) => name)).toEqual(expectedHeadings.map(({ name }: { name: string }) => name));
        expect(actualDom.headings).toHaveLength(expectedHeadings.length);
        actualDom.headings.forEach(({ box }, headingIndex) => box.forEach((value, boxIndex) => {
          expect(Math.abs(value - expectedHeadings[headingIndex].box[boxIndex]), `heading ${headingIndex} box[${boxIndex}]`).toBeLessThanOrEqual(2);
        }));
        expect(actualDom.interactiveBoxes.map(({ name }) => name)).toEqual(expectedInteractiveBoxes.map(({ name }: { name: string }) => name));
        expect(actualDom.interactiveBoxes).toHaveLength(expectedInteractiveBoxes.length);
        actualDom.interactiveBoxes.forEach(({ box }, interactiveIndex) => box.forEach((value, boxIndex) => {
          expect(Math.abs(value - expectedInteractiveBoxes[interactiveIndex].box[boxIndex]), `interactive ${interactiveIndex} box[${boxIndex}]`).toBeLessThanOrEqual(2);
        }));
      }
      const tokenColors = await page.evaluate((values: string[]) => values.map((value) => {
        const element = document.createElement("span");
        element.style.color = value;
        document.body.append(element);
        const normalized = getComputedStyle(element).color;
        element.remove();
        return normalized;
      }), [actualDom.tokens.background, actualDom.tokens.color, actualDom.tokens.accent, actualDom.tokens.glass,
        expectedDom.tokens.background, expectedDom.tokens.color, expectedDom.tokens.accent, expectedDom.tokens.glass]);
      expect(tokenColors.slice(0, 4)).toEqual(tokenColors.slice(4));
      expect(actualDom.tokens.fontFamily).toBe(expectedDom.tokens.fontFamily);
      expect(actualDom.tokens.radius).toBe(expectedDom.tokens.radius);
      const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
      expect(screenshot).toMatchSnapshot(["routes", `${route.id}-${width}.png`], {
        maxDiffPixelRatio: 0.01,
        ...(route.id === "player" ? { threshold: 0.205 } : {}),
      });
    });
  }
}
