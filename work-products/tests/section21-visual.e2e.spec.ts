import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateDir = resolve(dirname(fileURLToPath(import.meta.url)), ...(
  process.env.UXUV_WRITE_VISUAL_CANDIDATE === "1"
    ? ["fixtures", "ui-review", "section21-candidate"]
    : ["work", "section21-candidate-draft"]
));
const session = {
  accountId: "visual-admin", profileId: "visual-admin", username: "visual", name: "Visual Review",
  role: "super_admin", customPermissions: [], mode: "managed",
};
const runtimeConfig = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Section 21 visual fixture", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false },
  adKeywords: [], thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};
const emptyDocument = (kind: "config" | "library") => ({
  kind, version: 0, updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(page: Page) {
  let setupFailure = false;
  let syncFailure: "offline" | "quota" | "conflict" | "error" | null = null;
  const documents: Record<"config" | "library", {
    kind: "config" | "library";
    version: number;
    updatedAt: number | null;
    payload: ReturnType<typeof emptyDocument>["payload"];
  }> = {
    config: emptyDocument("config"), library: emptyDocument("library"),
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/config") return setupFailure
      ? json(route, { error: { code: "CONFIG_NOT_FOUND" } }, 404)
      : json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session });
    const kind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (kind && method === "POST" && syncFailure === "offline") return json(route, { error: { code: "STORAGE_UNAVAILABLE" } }, 503);
    if (kind && method === "POST" && syncFailure === "quota") return json(route, { error: { code: "STORAGE_QUOTA_EXCEEDED" } }, 503);
    if (kind && method === "POST" && syncFailure === "error") return json(route, { error: { code: "DOCUMENT_TOO_LARGE" } }, 413);
    if (kind && method === "POST" && syncFailure === "conflict") {
      return json(route, { error: { code: "SYNC_CONFLICT", details: { current: documents[kind] } } }, 409);
    }
    if (kind && method === "POST") {
      const body = route.request().postDataJSON() as { payload: (typeof documents)[typeof kind]["payload"] };
      documents[kind] = { ...documents[kind], version: documents[kind].version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, documents[kind]);
    }
    if (kind) return json(route, documents[kind]);
    if (path === "/api/app-update") return json(route, {
      currentVersion: "2.0.0", latestVersion: "2.0.0", status: "up-to-date",
      checkedAt: "2026-08-19T00:00:00.000Z", checkedRemotely: true,
    });
    if (path === "/api/auth/accounts") return json(route, {
      loginMode: "managed", managed: true, accounts: [{ id: "visual-admin", ...session }], totalCount: 1,
    });
    if (path === "/api/admin/usage") return json(route, {
      data: { configured: false, missing: [], message: "Section 21 local visual fixture" },
    });
    if (path === "/api/douban/tags") return json(route, { tags: ["热门", "科幻", "纪录片"] });
    if (path === "/api/douban/recommend") return json(route, { subjects: [
      { id: "review-1", title: "Section 21 Ready Player", cover: "/placeholder-poster.svg", rate: "9.1", url: "" },
      { id: "review-2", title: "Section 21 Documentary", cover: "/placeholder-poster.svg", rate: "8.8", url: "" },
    ] });
    if (path === "/api/premium/types") return json(route, { tags: [], capability: { profile: "paid", limits: {} } });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return {
    setSetupFailure: (value: boolean) => { setupFailure = value; },
    setSyncFailure: (value: typeof syncFailure) => { syncFailure = value; },
  };
}

async function setPreferences(page: Page, locale: "zh-CN" | "zh-TW" | "en", theme: "light" | "dark") {
  await page.evaluate(({ localeValue, themeValue }) => {
    for (const account of ["visual-admin", "anonymous"]) {
      localStorage.setItem(`uxuv-locale:${account}`, localeValue);
      localStorage.setItem(`uxuv-theme:${account}`, themeValue);
    }
    localStorage.setItem("uxuv-locale", localeValue);
    localStorage.setItem("uxuv-theme", themeValue);
  }, { localeValue: locale, themeValue: theme });
}

async function settleCandidate(page: Page, hideSync = true) {
  await page.addStyleTag({ content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}${hideSync ? ".sync-status{display:none!important}" : ""}` });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    window.scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  });
  await page.mouse.move(0, 0);
}

async function capture(page: Page, name: string, hideSync = true) {
  await settleCandidate(page, hideSync);
  await page.screenshot({ path: resolve(candidateDir, name), fullPage: true, animations: "disabled" });
}

async function expectSettingsSyncGeometry(page: Page, label: string) {
  const statusLocator = page.locator(".sync-status:not([hidden])");
  await statusLocator.scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const status = document.querySelector<HTMLElement>(".sync-status:not([hidden])")!;
    const statusBox = status.getBoundingClientRect();
    const overlaps = [".settings-back", ".settings-title-row", ".premium-settings-heading", ".app-update-trigger", ".history-sidebar-toggle", ".favorites-floating-button", ".source-sidebar-toggle"]
      .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
      .filter((element) => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")
      .map((element) => ({ selector: element.className, box: element.getBoundingClientRect() }))
      .filter(({ box }) => statusBox.left < box.right && statusBox.right > box.left && statusBox.top < box.bottom && statusBox.bottom > box.top)
      .map(({ selector }) => selector);
    return {
      left: statusBox.left, top: statusBox.top, right: statusBox.right, bottom: statusBox.bottom,
      width: statusBox.width, viewportWidth: innerWidth, viewportHeight: innerHeight, overlaps,
    };
  });
  expect(geometry.left, `${label}: status leaves the left edge`).toBeGreaterThanOrEqual(0);
  expect(geometry.top, `${label}: status leaves the top edge`).toBeGreaterThanOrEqual(0);
  expect(geometry.right, `${label}: status leaves the right edge`).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom, `${label}: status leaves the viewport`).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.width, `${label}: status has no rendered width`).toBeGreaterThan(0);
  expect(geometry.overlaps, `${label}: settings status overlaps navigation, title, or a floating action`).toEqual([]);
}

async function expectHomeHistoryTagLaneClear(page: Page, label: string) {
  const tags = page.locator(".kvideo-tag-sort-list .kvideo-sortable-tag");
  await expect(tags).toHaveCount(3);
  await expect(page.locator(".kvideo-movie-card")).toHaveCount(2);
  await settleCandidate(page);
  const geometry = await page.evaluate(async () => {
    const list = document.querySelector<HTMLElement>(".kvideo-tag-sort-list")!;
    const history = document.querySelector<HTMLElement>(".history-sidebar-toggle")!;
    const allTags = list.querySelectorAll<HTMLElement>(".kvideo-sortable-tag");
    const second = allTags[1];
    const third = allTags[2];
    const listBox = list.getBoundingClientRect();
    const historyBox = history.getBoundingClientRect();
    const secondBox = second.getBoundingClientRect();
    list.scrollLeft = list.scrollWidth;
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    const scrolledListBox = list.getBoundingClientRect();
    const thirdBox = third.getBoundingClientRect();
    list.scrollLeft = 0;
    return {
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollbarWidth: innerWidth - document.documentElement.clientWidth,
      listLeft: listBox.left,
      listRight: listBox.right,
      expectedListRight: innerWidth - 80,
      historyLeft: historyBox.left,
      secondRight: secondBox.right,
      laneGap: historyBox.left - listBox.right,
      secondRightGap: listBox.right - secondBox.right,
      scrollable: list.scrollWidth > list.clientWidth,
      thirdLeftGap: thirdBox.left - scrolledListBox.left,
      thirdRightGap: scrolledListBox.right - thirdBox.right,
    };
  });
  expect(geometry.scrollHeight, `${label}: fixture must expose a vertical scrollbar boundary: ${JSON.stringify(geometry)}`)
    .toBeGreaterThan(geometry.clientHeight);
  expect(Math.abs(geometry.listRight - geometry.expectedListRight), `${label}: tag lane must use viewport coordinates: ${JSON.stringify(geometry)}`)
    .toBeLessThanOrEqual(1);
  expect(geometry.laneGap, `${label}: history toggle overlaps the tag lane: ${JSON.stringify(geometry)}`)
    .toBeGreaterThanOrEqual(8);
  expect(geometry.secondRightGap, `${label}: second tag is clipped: ${JSON.stringify(geometry)}`)
    .toBeGreaterThanOrEqual(0);
  expect(geometry.scrollable, `${label}: third tag must remain horizontally reachable`).toBe(true);
  expect(geometry.thirdLeftGap, `${label}: third tag scrolls past the lane start: ${JSON.stringify(geometry)}`)
    .toBeGreaterThanOrEqual(0);
  expect(geometry.thirdRightGap, `${label}: third tag cannot be fully scrolled into the lane: ${JSON.stringify(geometry)}`)
    .toBeGreaterThanOrEqual(0);
}

test.use({ serviceWorkers: "block" });

test("S21-T06 Liquid Glass tokens and accessibility fallbacks are active at all four widths", async ({ page }) => {
  await mockWorker(page);
  await page.goto("./");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const glass = getComputedStyle(document.querySelector<HTMLElement>(".content-nav-glass")!);
      const channels = glass.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        inset: style.getPropertyValue("--shell-edge-inset").trim(),
        regular: style.getPropertyValue("--glass-regular-bg").trim(),
        clear: style.getPropertyValue("--glass-clear-bg").trim(),
        hit: style.getPropertyValue("--control-hit-size").trim(),
        glassAlpha: channels.length === 4 ? channels[3] : 1,
        glassImage: glass.backgroundImage,
        glassShadow: glass.boxShadow,
        glassFilter: glass.backdropFilter,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(tokens.inset).not.toBe("");
    expect(tokens.regular).not.toBe("");
    expect(tokens.clear).not.toBe("");
    expect(tokens.hit).toBe("2.75rem");
    expect(tokens.glassAlpha).toBeLessThanOrEqual(0.78);
    expect(tokens.glassImage).not.toBe("none");
    expect(tokens.glassShadow).toContain("inset");
    expect(tokens.glassFilter).toContain("blur");
    expect(tokens.overflow).toBe(false);
  }
});

test("S21-T15 captures visible settings sync states without covering navigation or titles", async ({ page }) => {
  const worker = await mockWorker(page);
  mkdirSync(candidateDir, { recursive: true });
  await page.goto("./");
  const prepare = async (locale: "zh-CN" | "zh-TW" | "en", width: number, failure: "offline" | "quota" | "conflict" | "error" | null) => {
    await page.evaluate(() => localStorage.removeItem("uxuv-sync-v1:visual-admin:config"));
    await setPreferences(page, locale === "zh-CN" ? "en" : "zh-CN", "dark");
    worker.setSyncFailure(failure);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./settings/");
    const label = locale === "zh-CN" ? "简体中文" : locale === "zh-TW" ? "繁體中文" : "English";
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: new RegExp(label) }).click();
  };

  await prepare("zh-TW", 320, "offline");
  await expect(page.locator('[data-sync-status="offline"]')).toBeVisible();
  await expectSettingsSyncGeometry(page, "offline zh-TW 320");
  await capture(page, "states-sync-offline-settings-zh-TW-320.png", false);

  await prepare("en", 768, "quota");
  await expect(page.locator('[data-sync-status="quota"]')).toBeVisible();
  await expectSettingsSyncGeometry(page, "quota en 768");
  await capture(page, "states-sync-quota-settings-en-768.png", false);

  await prepare("zh-CN", 1024, "conflict");
  await expect(page.locator('[data-sync-status="conflict"]')).toBeVisible();
  await expectSettingsSyncGeometry(page, "conflict zh-CN 1024");
  await capture(page, "states-sync-conflict-settings-zh-CN-1024.png", false);

  await prepare("en", 640, "error");
  await expect(page.locator('[data-sync-status="error"]')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expectSettingsSyncGeometry(page, "error en 640 at 200 percent text");
  await capture(page, "states-sync-error-text-200-settings-en-640.png", false);

  await prepare("zh-CN", 1440, "offline");
  await expect(page.locator('[data-sync-status="offline"]')).toBeVisible();
  worker.setSyncFailure(null);
  await page.locator('[data-sync-status="offline"]').getByRole("button", { name: "重试同步" }).click();
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
  await expectSettingsSyncGeometry(page, "synced zh-CN 1440");
  await capture(page, "states-sync-synced-settings-zh-CN-1440.png", false);
});

test("S21-T15 writes the eight final theme, contrast, zoom, and setup-error candidates", async ({ page }) => {
  const worker = await mockWorker(page);
  mkdirSync(candidateDir, { recursive: true });
  await page.goto("./");
  const cdp = await page.context().newCDPSession(page);
  const emulate = async (extra: Array<{ name: string; value: string }> = [], scheme = "dark") => {
    await cdp.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: "reduce" },
      ...extra,
    ] });
  };

  await emulate([], "light");
  await setPreferences(page, "zh-CN", "light");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".application-shell")).toBeVisible();
  await expect(page.locator(".app-update-trigger")).toContainText("2.0.0");
  await capture(page, "states-theme-light-home-zh-CN-1440.png");

  await emulate([{ name: "prefers-contrast", value: "more" }]);
  await setPreferences(page, "zh-CN", "dark");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("./");
  expect(await page.evaluate(() => matchMedia("(prefers-contrast: more)").matches)).toBe(true);
  expect(await page.locator(".content-nav-glass").evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--glass-border").trim())).toBe("currentColor");
  await expectHomeHistoryTagLaneClear(page, "contrast-more 320px");
  await capture(page, "states-contrast-more-home-zh-CN-320.png");

  await emulate([{ name: "forced-colors", value: "active" }]);
  await page.goto("./");
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  expect(await page.locator(".content-nav-glass").evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--glass-regular-bg").trim())).toBe("Canvas");
  await expectHomeHistoryTagLaneClear(page, "forced-colors 320px");
  await capture(page, "states-forced-colors-home-zh-CN-320.png");

  await emulate([{ name: "prefers-reduced-transparency", value: "reduce" }]);
  await page.goto("./");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)).toBe(true);
  expect(await page.locator(".content-nav-glass").evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--glass-regular-filter").trim())).toBe("none");
  await expectHomeHistoryTagLaneClear(page, "reduced-transparency 320px");
  await capture(page, "states-reduced-transparency-home-zh-CN-320.png");

  await emulate();
  await setPreferences(page, "en", "dark");
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("./settings/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".settings-domain-list")).toBeVisible();
  await expect(page.locator(".app-update-trigger")).toContainText("2.0.0");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, "states-text-200-settings-en-640.png");

  worker.setSetupFailure(true);
  for (const locale of ["zh-CN", "zh-TW", "en"] as const) {
    await setPreferences(page, locale, "dark");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator('.public-notice[role="alert"]')).toBeVisible();
    await capture(page, `states-setup-error-home-${locale}-320.png`);
  }
});
