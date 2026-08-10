import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const referenceRoot = resolve(pagesRoot, "work-products/tests/work/kvideo-reference");
const fixtureRoot = resolve(pagesRoot, "work-products/tests/fixtures/kvideo-4.9.19");
const referenceUrl = "http://127.0.0.1:4180";
const fixedTime = "2026-08-08T08:00:00.000+08:00";
const routes = [
  { id: "home", path: "/" },
  { id: "favorites", path: "/favorites" },
  { id: "iptv", path: "/iptv" },
  { id: "player", path: "/player?id=fixture-video&source=fixture-source&title=%E7%A4%BA%E4%BE%8B%E5%BD%B1%E7%89%87&episode=0" },
  { id: "premium", path: "/premium" },
  { id: "premium-favorites", path: "/premium/favorites" },
  { id: "premium-settings", path: "/premium/settings" },
  { id: "settings", path: "/settings" },
];
const widths = [320, 768, 1024, 1440];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`KVideo reference server did not become ready within ${timeoutMs}ms.`);
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installDeterministicNetwork(page, { locked = false } = {}) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== referenceUrl) return route.abort("blockedbyclient");
    if (url.pathname === "/fixture-media.m3u8") {
      return route.fulfill({
        status: 200,
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\n/fixture-segment.ts\n#EXT-X-ENDLIST\n",
      });
    }
    if (url.pathname === "/fixture-segment.ts") {
      return route.fulfill({ status: 200, contentType: "video/mp2t", body: "fixture" });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();

    if (url.pathname === "/api/auth") {
      return json(route, {
        hasAuth: locked,
        persistSession: true,
        loginMode: locked ? "managed" : "none",
        subscriptionSources: "",
        iptvSources: "",
        mergeSources: "false",
        danmakuApiUrl: "",
      });
    }
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: false, session: null }, 401);
    if (url.pathname === "/api/douban/recommend") {
      return json(route, { subjects: [
        { id: "movie-1", title: "示例电影", cover: "/placeholder-poster.svg", rate: "8.8", url: "" },
        { id: "movie-2", title: "示例剧集", cover: "/placeholder-poster.svg", rate: "8.2", url: "" },
        { id: "movie-3", title: "示例纪录片", cover: "/placeholder-poster.svg", rate: "9.0", url: "" },
      ] });
    }
    if (url.pathname === "/api/auth/accounts") {
      return json(route, { loginMode: "none", managed: false, accounts: [], totalCount: 0 });
    }
    if (url.pathname === "/api/user/config") {
      return json(route, { kind: "config", version: 0, updatedAt: null, payload: { fields: {}, sources: [], subscriptions: [], tombstones: [] } });
    }
    if (url.pathname === "/api/user/sync") {
      return json(route, { kind: "library", version: 0, updatedAt: null, payload: { history: [], favorites: [], tombstones: [] } });
    }
    if (url.pathname === "/api/config") return json(route, { sources: [] });
    if (url.pathname === "/api/app-update") {
      const release = { version: "4.9.19", publishedAt: "2026-08-08", title: "KVideo 4.9.19", notes: ["固定参考版本"] };
      return json(route, {
        currentVersion: "4.9.19",
        currentRelease: release,
        latestVersion: "4.9.19",
        latestRelease: release,
        status: "up-to-date",
        updateAvailable: false,
        checkedAt: "2026-08-08T00:00:00.000Z",
        checkedRemotely: false,
        usedRemoteManifest: false,
        source: {
          repository: "KuekHaoYang/KVideo",
          branch: "main",
          manifestUrl: "https://example.invalid/app-release.json",
          changelogUrl: "https://example.invalid/changelog",
          repositoryUrl: "https://example.invalid/repository",
        },
      });
    }
    if (url.pathname === "/api/detail") {
      return json(route, {
        success: true,
        data: {
          vod_id: "fixture-video",
          vod_name: "示例影片",
          vod_pic: "/placeholder-poster.svg",
          vod_content: "用于固定界面基线的合成简介。",
          vod_actor: "示例演员",
          vod_director: "示例导演",
          vod_year: "2026",
          vod_area: "测试区域",
          type_name: "剧情",
          episodes: [
            { name: "第 1 集", url: "/fixture-media.m3u8" },
            { name: "第 2 集", url: "/fixture-media.m3u8?episode=2" },
          ],
        },
      });
    }
    if (url.pathname === "/api/probe-resolution") return json(route, { success: false, resolution: null });
    return json(route, {});
  });
}

async function fixedContext(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Taipei",
    colorScheme: "dark",
    serviceWorkers: "block",
  });
  await context.addInitScript(({ now }) => {
    const NativeDate = Date;
    const fixed = new NativeDate(now).valueOf();
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length === 0 ? [fixed] : args));
      }
      static now() { return fixed; }
    }
    globalThis.Date = FixedDate;
    localStorage.clear();
    sessionStorage.clear();
  }, { now: fixedTime });
  return context;
}

async function captureDom(page, routeId, width) {
  return page.evaluate(({ capturedRoute, capturedWidth }) => {
    const compact = (value) => (value ?? "").replace(/\s+/g, " ").trim();
    const details = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        name: compact(element.getAttribute("aria-label") || element.textContent).slice(0, 240),
        type: element.getAttribute("type"),
        disabled: element.matches(":disabled"),
        box: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
      };
    };
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const main = document.querySelector("main");
    const mainRect = main?.getBoundingClientRect();
    return {
      route: capturedRoute,
      viewport: { width: capturedWidth, height: innerHeight },
      lang: document.documentElement.lang,
      title: document.title,
      bodyText: compact(document.body.innerText).slice(0, 12_000),
      headings: [...document.querySelectorAll("h1,h2,h3,h4")].map(details),
      interactive: [...document.querySelectorAll("a,button,input,select,textarea,[role]")].map(details),
      mainBox: mainRect ? [Math.round(mainRect.x), Math.round(mainRect.y), Math.round(mainRect.width), Math.round(mainRect.height)] : null,
      tokens: {
        background: body.backgroundColor,
        color: body.color,
        fontFamily: body.fontFamily,
        accent: root.getPropertyValue("--accent-color").trim(),
        glass: root.getPropertyValue("--glass-bg").trim(),
        radius: root.getPropertyValue("--radius-2xl").trim(),
      },
    };
  }, { capturedRoute: routeId, capturedWidth: width });
}

const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--webpack",
  "-H",
  "127.0.0.1",
  "-p",
  "4180",
], {
  cwd: referenceRoot,
  env: {
    ...process.env,
    VIDEOTOGETHER_ENABLED: "false",
    NEXT_PUBLIC_SITE_NAME: "KVideo",
    NEXT_PUBLIC_SITE_TITLE: "KVideo - 视频聚合平台",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForServer(referenceUrl);
  const browser = await chromium.launch({ channel: "chrome" });
  const manifest = {
    schemaVersion: 1,
    reference: JSON.parse(readFileSync(resolve(referenceRoot, ".source-identity.json"), "utf8")),
    environment: {
      locale: "zh-CN",
      timezone: "Asia/Taipei",
      fixedTime,
      colorScheme: "dark",
      chromium: browser.version(),
      viewportHeight: 900,
      widths,
      thirdPartyNetwork: "blocked",
    },
    captures: [],
  };

  for (const width of widths) {
    const context = await fixedContext(browser, width);
    const page = await context.newPage();
    await installDeterministicNetwork(page);
    for (const route of routes) {
      await page.goto(new URL(route.path, referenceUrl).href, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const dom = await captureDom(page, route.id, width);
      const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
      const domPath = resolve(fixtureRoot, "dom", `${route.id}-${width}.json`);
      const screenshotPath = resolve(fixtureRoot, "routes", `${route.id}-${width}.png`);
      write(domPath, `${JSON.stringify(dom, null, 2)}\n`);
      write(screenshotPath, screenshot);
      manifest.captures.push({
        route: route.id,
        path: route.path,
        width,
        dom: `dom/${route.id}-${width}.json`,
        domSha256: sha256(readFileSync(domPath)),
        screenshot: `routes/${route.id}-${width}.png`,
        screenshotSha256: sha256(screenshot),
      });
    }
    await context.close();
  }

  const loginContext = await fixedContext(browser, 1024);
  const loginPage = await loginContext.newPage();
  await installDeterministicNetwork(loginPage, { locked: true });
  await loginPage.goto(referenceUrl, { waitUntil: "networkidle" });
  await loginPage.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
  await loginPage.waitForTimeout(100);
  const loginDom = await captureDom(loginPage, "login", 1024);
  const loginScreenshot = await loginPage.screenshot({ fullPage: true, animations: "disabled" });
  write(resolve(fixtureRoot, "dom/login-1024.json"), `${JSON.stringify(loginDom, null, 2)}\n`);
  write(resolve(fixtureRoot, "states/login-1024.png"), loginScreenshot);
  manifest.captures.push({
    route: "login",
    path: "/",
    width: 1024,
    dom: "dom/login-1024.json",
    domSha256: sha256(readFileSync(resolve(fixtureRoot, "dom/login-1024.json"))),
    screenshot: "states/login-1024.png",
    screenshotSha256: sha256(loginScreenshot),
  });
  await loginContext.close();

  write(resolve(fixtureRoot, "baseline-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await browser.close();
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${serverOutput.slice(-4000)}`);
} finally {
  server.kill();
}
