import { expect, test, type Page, type Route } from "@playwright/test";
import axe from "axe-core";

test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei" });

const TOKEN = "analytics-token-must-never-reach-browser";
const retiredUsageNames = [
  ["CF", "WORKER", "SCRIPT", "NAME"].join("_"),
  ["CF", "D1", "DATABASE", "ID"].join("_"),
];
const adminSession = {
  accountId: "admin-1", profileId: "admin-1", username: "admin", name: "Administrator",
  role: "super_admin", customPermissions: [], mode: "managed",
};
const runtimeConfig = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const emptyDocument = (kind: "config" | "library") => ({
  kind, version: 0, updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});
type SyncDocument = { kind: "config" | "library"; version: number; updatedAt: number | null; payload: Record<string, unknown> };
const usageData = {
  configured: true,
  period: {
    start: "2026-08-07T00:00:00.000Z",
    end: "2026-08-07T12:34:56.000Z",
    resetsAt: "2026-08-08T00:00:00.000Z",
  },
  workers: {
    accountRequests: 85_000, accountErrors: 17, accountLimit: 100_000,
  },
  d1: {
    accountRowsRead: 4_250_000, accountRowsWritten: 60_000, accountStorageBytes: 4_750_000_000,
    accountRowsReadLimit: 5_000_000, accountRowsWrittenLimit: 100_000,
    accountStorageBytesLimit: 5_000_000_000,
  },
  level: "critical",
  warnings: ["WORKERS_ACCOUNT_WARNING", "D1_ACCOUNT_READ_WARNING", "D1_ACCOUNT_STORAGE_CRITICAL"],
  observedAt: "2026-08-07T12:34:56.000Z",
  stale: false,
  source: "cloudflare-graphql",
};

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

type UsageMode = "ready" | "stale" | "unconfigured" | "error" | "auth-error" | "legacy" | "missing" | "nonfinite"
  | "invalid-time" | "contradictory";
type ThresholdLevel = "notice" | "warning" | "critical" | "exhausted";

const thresholdCases: Record<ThresholdLevel, { requests: number; warning: string }> = {
  notice: { requests: 70_000, warning: "WORKERS_ACCOUNT_NOTICE" },
  warning: { requests: 85_000, warning: "WORKERS_ACCOUNT_WARNING" },
  critical: { requests: 95_000, warning: "WORKERS_ACCOUNT_CRITICAL" },
  exhausted: { requests: 100_000, warning: "WORKERS_ACCOUNT_EXHAUSTED" },
};

function localeChoice(page: Page, value: "zh-CN" | "zh-TW" | "en") {
  const label = value === "zh-CN" ? /简体中文/ : value === "zh-TW" ? /繁體中文/ : /English/;
  return page.locator('[data-settings-section="display"]').getByRole("button", { name: label });
}

async function mockWorker(page: Page, role: "super_admin" | "viewer" = "super_admin") {
  let usageMode: UsageMode = "ready";
  let threshold: ThresholdLevel | null = null;
  let usageRequests = 0;
  const documents: Record<"config" | "library", SyncDocument> = {
    config: emptyDocument("config"), library: emptyDocument("library"),
  };
  const requests: Array<{ url: string; method: string; body: string | null; headers: Record<string, string> }> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ url: request.url(), method: request.method(), body: request.postData(), headers: request.headers() });
    if (path === "/api/config") return fulfill(route, runtimeConfig);
    if (path === "/api/auth/session") {
      return fulfill(route, { authenticated: true, session: { ...adminSession, role, name: role === "viewer" ? "Viewer" : "Administrator" } });
    }
    const syncKind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (syncKind && request.method() === "GET") return fulfill(route, documents[syncKind]);
    if (syncKind && request.method() === "POST") {
      const input = request.postDataJSON() as { payload: (typeof documents)[typeof syncKind]["payload"] };
      const current = documents[syncKind];
      documents[syncKind] = { kind: syncKind, version: current.version + 1, updatedAt: Date.now(), payload: input.payload };
      return fulfill(route, documents[syncKind]);
    }
    if (path === "/api/auth/accounts") {
      return fulfill(route, { loginMode: "managed", managed: true, accounts: [{ id: "admin-1", ...adminSession }], totalCount: 1 });
    }
    if (path === "/api/admin/usage") {
      usageRequests += 1;
      if (usageMode === "auth-error") {
        return fulfill(route, { error: { code: "SESSION_INVALID", message: "Session expired." } }, 401);
      }
      if (usageMode === "error") {
        return fulfill(route, { error: { code: "USAGE_UPSTREAM_ERROR", message: "Cloudflare analytics is temporarily unavailable." } }, 502);
      }
      if (usageMode === "unconfigured") {
        return fulfill(route, { data: {
          configured: false,
          missing: ["CF_ANALYTICS_API_TOKEN", "CF_ACCOUNT_ID"],
          message: "Cloudflare usage analytics is not configured.",
        } });
      }
      if (usageMode === "legacy") {
        return fulfill(route, { data: {
          ...usageData,
          workers: { ...usageData.workers, scriptRequests: 1_250 },
        } });
      }
      if (usageMode === "missing") {
        return fulfill(route, { data: {
          ...usageData,
          d1: Object.fromEntries(Object.entries(usageData.d1).filter(([name]) => name !== "accountStorageBytesLimit")),
        } });
      }
      if (usageMode === "nonfinite") {
        const body = JSON.stringify({ data: usageData }).replace('"accountRequests":85000', '"accountRequests":1e400');
        return route.fulfill({ status: 200, contentType: "application/json", body });
      }
      if (usageMode === "invalid-time") {
        return fulfill(route, { data: {
          ...usageData,
          period: { ...usageData.period, resetsAt: "not-a-date" },
        } });
      }
      if (usageMode === "contradictory") {
        return fulfill(route, { data: {
          ...usageData,
          level: "normal",
          warnings: [],
        } });
      }
      const boundary = threshold ? thresholdCases[threshold] : null;
      return fulfill(route, { data: {
        ...usageData,
        level: threshold ?? usageData.level,
        workers: { ...usageData.workers, accountRequests: boundary?.requests ?? usageData.workers.accountRequests },
        d1: boundary ? {
          ...usageData.d1,
          accountRowsRead: 1,
          accountRowsWritten: 1,
          accountStorageBytes: 1,
        } : usageData.d1,
        stale: usageMode === "stale",
        warnings: boundary ? [boundary.warning] : usageMode === "stale" ? [...usageData.warnings, "USAGE_DATA_STALE"] : usageData.warnings,
      } });
    }
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return {
    requests,
    usageRequests: () => usageRequests,
    setUsageMode: (mode: UsageMode) => { usageMode = mode; },
    setThreshold: (level: ThresholdLevel) => { threshold = level; },
  };
}

test("super_admin sees the ordered four-metric usage card and non-dismissible global warning", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T12:34:56.000Z"));
  const worker = await mockWorker(page);
  await page.goto("./settings/");

  const card = page.locator('[data-settings-section="usage"]');
  await expect(card.getByRole("heading", { name: "Cloudflare 用量" })).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveCount(4);
  await expect(card.getByText("Workers 账户请求", { exact: true })).toBeVisible();
  await expect(card.getByText("D1 账户读取", { exact: true })).toBeVisible();
  await expect(card.getByText("D1 账户写入", { exact: true })).toBeVisible();
  await expect(card.getByText("D1 账户存储", { exact: true })).toBeVisible();
  await expect(card.getByText("85,000 / 100,000")).toBeVisible();
  await expect(card.getByText("账户错误 17 次")).toBeVisible();
  await expect(card.getByText("UTC 重置倒计时", { exact: false })).toBeVisible();
  await expect(card.getByText("2026-08-07 12:34:56 UTC", { exact: false })).toBeVisible();
  expect(await card.innerText()).not.toMatch(/本项目|本脚本|本数据库|项目警戒线/);

  const approvedDomainOrder = await page.evaluate(() => {
    const account = document.querySelector("#accounts-title")?.closest("section");
    const usage = document.querySelector('[data-settings-section="usage"]');
    const player = document.querySelector('[data-settings-section="player"]');
    return !!account && !!usage && !!player
      && !!(account.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(player.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING)
      && usage.closest('[data-settings-domain="sync"]') !== null;
  });
  expect(approvedDomainOrder).toBe(true);

  const banner = page.locator("[data-usage-alert='critical']");
  await expect(banner).toContainText("Cloudflare 用量已达到严重级别");
  await expect(banner.getByRole("button")).toHaveCount(0);
  expect(worker.usageRequests()).toBe(1);

  const cardStyles = await page.locator('[data-settings-section="accounts"], [data-settings-section="usage"], [data-settings-section="player"]')
    .evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { background: style.background, border: style.border, borderRadius: style.borderRadius, padding: style.padding };
    }));
  expect(cardStyles[1]).toEqual(cardStyles[0]);
  expect(cardStyles[1]).toEqual(cardStyles[2]);

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(card).toBeVisible();

  await localeChoice(page, "zh-TW").click();
  await expect(card.getByRole("heading", { name: "Cloudflare 用量" })).toBeVisible();
  await expect(card.getByText("D1 帳戶儲存", { exact: true })).toBeVisible();
  expect(await card.innerText()).not.toMatch(/本專案|本腳本|本資料庫|專案警戒線/);
  await expect(page.locator("[data-usage-alert='critical']")).toContainText("Cloudflare 用量已達嚴重級別");
  await localeChoice(page, "en").click();
  await expect(card.getByRole("heading", { name: "Cloudflare usage" })).toBeVisible();
  await expect(card.getByText("D1 account storage", { exact: true })).toBeVisible();
  expect(await card.innerText()).not.toMatch(/\b(?:project|script|database)\b/i);
  await expect(page.locator("[data-usage-alert='critical']")).toContainText("Cloudflare usage reached the critical level");
  await localeChoice(page, "zh-CN").click();
  await expect(card.getByRole("heading", { name: "Cloudflare 用量" })).toBeVisible();

  await page.addScriptTag({ content: axe.source });
  const violations = await card.evaluate(async (element) => {
    const axeApi = (window as unknown as { axe: { run: (root: Element) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axeApi.run(element);
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  });
  expect(violations).toEqual([]);

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await card.getByRole("button", { name: "刷新用量" }).click();
  await expect.poll(worker.usageRequests).toBe(2);
  await expect(card.getByRole("button", { name: "刷新用量" })).toBeDisabled();
  await card.getByRole("button", { name: "刷新用量" }).evaluate((button) => (button as HTMLButtonElement).click());
  expect(worker.usageRequests()).toBe(2);
  const browserState = JSON.stringify({ html: await page.content(), storage: await page.context().storageState(), requests: worker.requests });
  expect(browserState).not.toContain(TOKEN);
});

test("usage card exposes stale, unconfigured, and failure states without exposing credentials", async ({ page }) => {
  const worker = await mockWorker(page);
  worker.setUsageMode("stale");
  await page.goto("./settings/");
  const card = page.locator('[data-settings-section="usage"]');
  await expect(card.getByText("数据可能已陈旧")).toBeVisible();

  worker.setUsageMode("unconfigured");
  await card.getByRole("button", { name: "刷新用量" }).click();
  await expect(card.getByText("尚未配置 Cloudflare 用量分析")).toBeVisible();
  await expect(card.getByText("CF_ANALYTICS_API_TOKEN")).toBeVisible();
  await expect(card.getByText("CF_ACCOUNT_ID")).toBeVisible();
  for (const retiredName of retiredUsageNames) expect(await card.innerText()).not.toContain(retiredName);

  worker.setUsageMode("error");
  await page.reload();
  await expect(card.getByRole("alert")).toContainText("无法读取 Cloudflare 用量");
  await expect(card.getByRole("alert")).toContainText("USAGE_UPSTREAM_ERROR");
  expect(JSON.stringify(worker.requests)).not.toContain(TOKEN);
});

test("usage parser rejects legacy, incomplete, non-finite, invalid-time, and contradictory responses", async ({ page }) => {
  const worker = await mockWorker(page);
  worker.setUsageMode("legacy");
  await page.goto("./settings/");
  const card = page.locator('[data-settings-section="usage"]');
  await expect(card.getByRole("alert")).toContainText("无法读取 Cloudflare 用量");

  for (const mode of ["missing", "nonfinite", "invalid-time", "contradictory"] as const) {
    worker.setUsageMode(mode);
    await page.reload();
    await expect(card.getByRole("alert")).toContainText("无法读取 Cloudflare 用量");
  }
});

test("usage authentication failure expires the session without reflecting upstream details", async ({ page }) => {
  const worker = await mockWorker(page);
  worker.setUsageMode("auth-error");
  await page.goto("./settings/");
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  await expect(page.getByText("会话已失效，请重新登录。")).toBeVisible();
  expect(worker.usageRequests()).toBe(1);
  expect(await page.locator("body").innerText()).not.toContain("Session expired");
});

test("usage warning levels preserve the 70, 85, 95, and 100 percent boundaries", async ({ page }) => {
  const worker = await mockWorker(page);
  await page.goto("./settings/");
  const card = page.locator('[data-settings-section="usage"]');

  for (const level of ["notice", "warning", "critical", "exhausted"] as const) {
    worker.setThreshold(level);
    await page.reload();
    await expect(card.locator(`.usage-summary[data-level="${level}"]`)).toBeVisible();
    await expect(card.locator(`.usage-metric[data-level="${level}"]`)).toContainText(thresholdCases[level].requests.toLocaleString("en-US"));
  }
});

test("ordinary users never request or render precise usage", async ({ page }) => {
  const worker = await mockWorker(page, "viewer");
  await page.goto("./settings/");
  await expect(page.locator('[data-settings-section="usage"]')).toHaveCount(0);
  await expect(page.locator("[data-usage-alert]")).toHaveCount(0);
  expect(worker.usageRequests()).toBe(0);
  expect(await page.locator("body").innerText()).not.toContain("85,000");
});

test("direct Pages entry never requests the usage API", async ({ page, request }) => {
  let usageRequests = 0;
  await page.route("https://uxudjs.github.io:4173/**", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.pathname === "/api/admin/usage") usageRequests += 1;
    const response = await request.get(`http://127.0.0.1:4173${requested.pathname}${requested.search}`);
    await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() });
  });
  await page.goto("https://uxudjs.github.io:4173/UXUV-Pages/settings/");
  await expect(page.getByRole("heading", { name: "UXUVideo 部署说明" })).toBeVisible();
  expect(usageRequests).toBe(0);
  await page.unrouteAll({ behavior: "wait" });
});
