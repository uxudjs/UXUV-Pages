import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = join(root, "work-products", "tests", "fixtures", "ui-review");
const base = "http://127.0.0.1:4173/UXUV-Pages/";
const widths = [320, 768, 1024, 1440];
const locales = [{ value: "zh-CN", index: 0, label: "简体中文" }, { value: "zh-TW", index: 1, label: "繁體中文" }, { value: "en", index: 2, label: "English" }];
const session = { accountId: "ui-review", profileId: "ui-review", username: "viewer", name: "Viewer", role: "viewer", customPermissions: [], mode: "managed" };
let configDocument = { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, sources: [], subscriptions: [], tombstones: [] } };
const libraryDocument = { kind: "library", version: 1, updatedAt: 1, payload: { history: [], favorites: [], tombstones: [] } };

await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [join(root, "work-products", "tests", "static-server.mjs")], { cwd: root, stdio: "ignore", windowsHide: true });
for (let attempt = 0; attempt < 60; attempt += 1) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ locale: "zh-CN", colorScheme: "dark" });
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/config") return json({
      release: { worker: "1.0.0", pages: "0.2.0", apiContract: 1 }, site: { name: "UXUVideo", title: "UXUVideo", description: "私人视频空间", iconUrl: "/icon.png" },
      capabilities: { premium: true, iptv: true, danmaku: false }, adKeywords: [], authenticated: true,
      thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
    });
    if (path === "/api/auth/session") return json({ authenticated: true, session });
    if (path === "/api/user/config" && request.method() === "POST") {
      const body = request.postDataJSON();
      configDocument = { kind: "config", version: configDocument.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(configDocument);
    }
    if (path === "/api/user/config") return json(configDocument);
    if (path === "/api/user/sync") return json(libraryDocument);
    if (path === "/api/app-update") return json({
      currentVersion: "1.0.0", latestVersion: "1.1.0", status: "update-available", checkedAt: "2026-08-11T08:00:00.000Z",
      copy: { available: true, href: "/api/app-update?artifact=worker", version: "1.1.0" },
      source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/uxudjs/UXUVideo" },
    });
    if (path === "/api/douban/tags") return json({ tags: ["电影"] });
    if (path === "/api/douban/recommend") return json({ subjects: [] });
    return json({ error: { code: "NOT_FOUND" } }, 404);
  });

  const page = await context.newPage();
  for (const width of widths) {
    for (const locale of locales) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}settings/`);
      const language = page.locator(".display-language-options");
      await language.locator("button").nth(locale.index).click();
      await page.locator("html").waitFor({ state: "attached" });
      await language.screenshot({ path: join(output, `language-${locale.value}-${width}.png`), animations: "disabled" });
      await page.locator(".app-update-trigger").click();
      await page.locator(".app-update-dialog").screenshot({ path: join(output, `update-${locale.value}-${width}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await page.goto(base);
      await page.locator(".content-nav-glass").waitFor();
      await page.screenshot({ path: join(output, `chrome-${locale.value}-${width}.png`), animations: "disabled",
        clip: { x: 0, y: 0, width, height: 180 } });
      if (locale.value === "zh-CN" && width === 1024) {
        await page.goto(`${base}settings/`);
        await page.screenshot({ path: join(output, "settings-new-1024.png"), animations: "disabled", fullPage: true });
      }
    }
  }

  const dataUrl = async (path) => `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
  const makeSheet = async (title, prefix, imageHeight) => {
    const cells = await Promise.all(widths.flatMap((width) => locales.map(async (locale) => ({
      width, locale: locale.label, src: await dataUrl(join(output, `${prefix}-${locale.value}-${width}.png`)),
    }))));
    await page.setViewportSize({ width: 1500, height: 1600 });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:15px system-ui;padding:32px}h1{margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.cell{border:1px solid #cbd5e1;background:#fff;padding:12px}.cell strong{display:block;margin-bottom:8px}.cell img{display:block;width:100%;height:${imageHeight}px;object-fit:contain;object-position:top center;background:#e2e8f0}</style>
      <h1>${title}</h1><div class="grid">${cells.map((cell) => `<div class="cell"><strong>${cell.width}px · ${cell.locale}</strong><img src="${cell.src}"></div>`).join("")}</div>`);
    await page.screenshot({ path: join(output, `${prefix}-review-sheet.png`), animations: "disabled", fullPage: true });
  };
  await makeSheet("顶部导航与全局版本入口候选", "chrome", 180);
  await makeSheet("语言设置：三列、无说明小字", "language", 130);
  await makeSheet("版本与更新弹窗", "update", 320);

  const oldHome = await dataUrl(join(root, "work-products", "tests", "fixtures", "kvideo-4.9.19", "routes", "home-1024.png"));
  await page.setViewportSize({ width: 1024, height: 180 });
  await page.setContent(`<style>html,body{margin:0;width:1024px;height:180px;overflow:hidden}img{display:block;width:1024px;height:auto}</style><img src="${oldHome}">`);
  const oldNavPath = join(output, "chrome-old-1024.png");
  await page.screenshot({ path: oldNavPath, animations: "disabled" });
  const oldNav = await dataUrl(oldNavPath);
  const newNav = await dataUrl(join(output, "chrome-zh-CN-1024.png"));
  const oldSettings = await dataUrl(join(root, "work-products", "tests", "fixtures", "kvideo-4.9.19", "routes", "settings-1024.png"));
  const newSettings = await dataUrl(join(output, "settings-new-1024.png"));
  await page.setViewportSize({ width: 1500, height: 1200 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:15px system-ui;padding:32px}h1{margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.cell{border:1px solid #cbd5e1;background:#fff;padding:14px}.cell h2{margin:0 0 10px;font-size:18px}.cell img{display:block;width:100%;object-position:top;background:#e2e8f0}.cell.nav img{height:180px;object-fit:contain}.cell.settings img{height:470px;object-fit:cover}.note{margin-top:10px;color:#475569}</style>
    <h1>1024px：旧实现 / 新候选</h1><div class="grid">
      <div class="cell nav"><h2>旧顶部</h2><img src="${oldNav}"><div class="note">GitHub、收藏、独立设置、语言与全名同层堆叠</div></div>
      <div class="cell nav"><h2>新顶部</h2><img src="${newNav}"><div class="note">仅保留高频动作；首字 V 直接进入设置；全局版本提示独立放在右上</div></div>
      <div class="cell settings"><h2>旧设置</h2><img src="${oldSettings}"><div class="note">大型版本卡占据设置首屏</div></div>
      <div class="cell settings"><h2>新设置</h2><img src="${newSettings}"><div class="note">版本卡移出；设置从账户与用量开始，语言三列直达</div></div>
    </div>`);
  await page.screenshot({ path: join(output, "before-after-1024.png"), animations: "disabled", fullPage: true });
} finally {
  await browser.close();
  server.kill();
}
