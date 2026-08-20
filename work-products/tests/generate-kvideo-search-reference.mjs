import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const referenceRoot = resolve(pagesRoot, "work-products/tests/work/kvideo-reference");
const fixtureRoot = resolve(pagesRoot, "work-products/tests/fixtures/kvideo-4.9.19");
const referenceUrl = "http://127.0.0.1:4180";
const widths = [320, 768, 1024, 1440];
const sourceIdentity = JSON.parse(readFileSync(resolve(referenceRoot, ".source-identity.json"), "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(referenceUrl);
      if (response.ok) return;
    } catch {
      // The fixed reference is still compiling.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("KVideo search reference server did not become ready.");
}

async function installNetwork(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== referenceUrl) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/auth") return json({ hasAuth: false, persistSession: true, loginMode: "none" });
    if (url.pathname === "/api/search-parallel") {
      const events = [
        { type: "start", totalSources: 2 },
        { type: "videos", source: "source-a", videos: [{ vod_id: "a-1", vod_name: "同名电影", vod_pic: "/placeholder-poster.svg", vod_remarks: "更新至 12 集", vod_year: "2026", type_name: "剧情", vod_lang: "国语", source: "source-a", sourceDisplayName: "来源甲" }] },
        { type: "videos", source: "source-b", videos: [
          { vod_id: "b-2", vod_name: " 同名电影 ", vod_pic: "/placeholder-poster.svg", vod_year: "2025", type_name: "剧情", vod_lang: "粤语", source: "source-b", sourceDisplayName: "来源乙" },
          { vod_id: "b-3", vod_name: "另一部电影", vod_pic: "/placeholder-poster.svg", vod_year: "2024", type_name: "纪录片", vod_lang: "英语", source: "source-b", sourceDisplayName: "来源乙" },
        ] },
        { type: "progress", completedSources: 2, totalVideosFound: 3 },
        { type: "complete" },
      ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    if (url.pathname === "/api/douban/recommend") return json({ subjects: [] });
    if (url.pathname === "/api/probe-resolution") return json({ success: false, resolution: null });
    return json({});
  });
}

async function capture(browser, width, displayMode) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", serviceWorkers: "block" });
  await context.addInitScript(({ mode }) => {
    const fixed = new Date("2026-08-08T08:00:00.000+08:00").valueOf();
    Date.now = () => fixed;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("kvideo-settings", JSON.stringify({
      sources: [
        { id: "source-a", name: "来源甲", baseUrl: "https://a.example", enabled: true },
        { id: "source-b", name: "来源乙", baseUrl: "https://b.example", enabled: true },
      ],
      searchDisplayMode: mode,
    }));
  }, { mode: displayMode });
  const page = await context.newPage();
  await installNetwork(page);
  await page.goto(referenceUrl, { waitUntil: "networkidle" });
  await page.getByLabel("搜索视频内容").fill("电影");
  await page.getByLabel("搜索视频内容").press("Enter");
  const grid = page.getByRole("list", { name: "视频搜索结果" });
  await grid.waitFor();
  await grid.evaluate((element) => {
    for (const candidate of document.body.querySelectorAll("*")) {
      if (candidate.tagName.toLowerCase() === "nextjs-portal" || (!element.contains(candidate) && getComputedStyle(candidate).position === "fixed")) {
        candidate.style.visibility = "hidden";
      }
    }
  });
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const geometry = await grid.evaluate((element) => {
    const box = (candidate) => {
      if (!candidate) return null;
      const rectangle = candidate.getBoundingClientRect();
      const root = element.getBoundingClientRect();
      return [Math.round(rectangle.x - root.x), Math.round(rectangle.y - root.y), Math.round(rectangle.width), Math.round(rectangle.height)];
    };
    const card = element.firstElementChild;
    const poster = card?.querySelector('[class*="aspect-"]');
    const title = card?.querySelector("h4");
    return { grid: box(element), card: box(card), poster: box(poster), image: box(card?.querySelector("img")), copy: box(title?.parentElement), title: box(title) };
  });
  const bytes = await grid.screenshot({ animations: "disabled" });
  await context.close();
  return { bytes, geometry };
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "127.0.0.1", "-p", "4180"], {
  cwd: referenceRoot,
  env: { ...process.env, VIDEOTOGETHER_ENABLED: "false", NEXT_PUBLIC_SITE_NAME: "KVideo", NEXT_PUBLIC_SITE_TITLE: "KVideo - 视频聚合平台" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForServer();
  const browser = await chromium.launch({ channel: "chrome" });
  const captures = [];
  for (const width of widths) {
    const { bytes, geometry } = await capture(browser, width, "normal");
    const relativePath = `slices-search-results-normal-${width}.png`;
    const target = resolve(fixtureRoot, relativePath);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(target, bytes);
    captures.push({ displayMode: "normal", width, path: relativePath, sha256: sha256(bytes), geometry });
  }
  const { bytes: groupedBytes, geometry: groupedGeometry } = await capture(browser, 1024, "grouped");
  const groupedPath = "slices-search-results-grouped-1024.png";
  writeFileSync(resolve(fixtureRoot, groupedPath), groupedBytes);
  captures.push({ displayMode: "grouped", width: 1024, path: groupedPath, sha256: sha256(groupedBytes), geometry: groupedGeometry });
  writeFileSync(resolve(fixtureRoot, "search-results-manifest.json"), `${JSON.stringify({ schemaVersion: 1, reference: sourceIdentity, captures }, null, 2)}\n`);
  await browser.close();
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${serverOutput.slice(-4000)}`);
} finally {
  server.kill();
}
