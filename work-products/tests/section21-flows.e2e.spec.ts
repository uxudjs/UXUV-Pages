import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ locale: 'zh-CN', timezoneId: 'Asia/Taipei', serviceWorkers: 'block' });

const session = {
  accountId: 'section21-account', profileId: 'section21-account', username: 'section21', name: 'Section 21 User',
  role: 'super_admin', customPermissions: [], mode: 'managed',
};
const capability = {
  profile: 'free',
  limits: { sources: 12, searchConcurrency: 5, maxPages: 3, videos: 500, probeVideos: 6, probeConcurrency: 3, probeVariants: 2 },
};
const runtimeConfig = {
  release: { worker: '2.0.0', pages: '0.3.0', apiContract: 2 },
  site: { name: 'UXUVideo', title: 'UXUVideo', description: 'Section 21 fixture', iconUrl: '/icon.png' },
  capabilities: { premium: true, danmaku: true },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const source = (id: string, name: string) => ({
  id, name, baseUrl: `https://${id}.example/api.php/provide/vod`, enabled: true, kind: 'personal', group: 'normal', updatedAt: 1,
});
const documents = {
  config: {
    kind: 'config', version: 1, updatedAt: 1,
    payload: { fields: {}, sources: [source('anime-source', '动漫源'), source('tv-source', '电视剧源')], subscriptions: [], tombstones: [] },
  },
  library: { kind: 'library', version: 1, updatedAt: 1, payload: { history: [], favorites: [], tombstones: [] } },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function readyApplication(page: Page) {
  let documentPulls = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/config') return json(route, runtimeConfig);
    if (path === '/api/auth/session') return json(route, { authenticated: true, session });
    if (path === '/api/user/config' || path === '/api/user/sync') {
      const kind = path.endsWith('config') ? 'config' : 'library';
      if (request.method() === 'GET') documentPulls += 1;
      return json(route, documents[kind]);
    }
    if (path === '/api/douban/tags') return json(route, { tags: ['热门'] });
    if (path === '/api/douban/recommend') return json(route, { subjects: [] });
    if (path === '/api/app-update') return json(route, {
      status: 'up-to-date', currentVersion: '1.1.4', latestVersion: '1.1.4', checkedAt: '2026-08-18T00:00:00.000Z',
    });
    if (path === '/api/search-parallel') {
      const events = [
        { type: 'start', totalSources: 2, capability },
        { type: 'videos', source: 'anime-source', videos: [{
          vod_id: 'anime-1', vod_name: '同名作品', vod_pic: '', vod_year: '2025', type_name: '动漫',
          source: 'anime-source', sourceName: '动漫源',
        }] },
        { type: 'videos', source: 'tv-source', videos: [{
          vod_id: 'tv-1', vod_name: '同名作品', vod_pic: '', vod_year: '2025', type_name: '电视剧',
          source: 'tv-source', sourceName: '电视剧源',
        }] },
        { type: 'progress', completedSources: 2, totalVideosFound: 2 },
        { type: 'complete', totalVideosFound: 2, totalSources: 2, maxPageCount: 3 },
      ];
      return route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    }
    return json(route, { error: { code: 'NOT_FOUND' } }, 404);
  });
  return { pulls: () => documentPulls };
}

async function search(page: Page) {
  const input = page.getByRole('combobox', { name: '搜索视频内容' });
  await expect(input).toBeEnabled();
  await input.fill('同名作品');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.kvideo-result-card').first()).toBeVisible();
}

test('S21-T05 focus performs no document pull', async ({ page }) => {
  const server = await readyApplication(page);
  await page.goto('./');
  await expect(page.getByRole('combobox', { name: '搜索视频内容' })).toBeEnabled();
  const beforeFocus = server.pulls();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  expect(server.pulls()).toBe(beforeFocus);
});

test('S21-T05 brand activation navigates to the logical root', async ({ page }) => {
  await readyApplication(page);
  await page.goto('./');
  await search(page);
  await page.locator('a.content-brand').click();
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('S21-T05 brand activation clears transient search results', async ({ page }) => {
  await readyApplication(page);
  await page.goto('./');
  await search(page);
  await page.locator('a.content-brand').click();
  await expect(page.getByRole('combobox', { name: '搜索视频内容' })).toHaveValue('');
  await expect(page.locator('.kvideo-result-card')).toHaveCount(0);
});

test('S21-T07 keeps anime and TV results apart', async ({ page }) => {
  await readyApplication(page);
  await page.goto('./');
  await search(page);
  const cards = page.locator('.kvideo-result-card');
  await expect(cards).toHaveCount(2);
});

test('S21-T07 exposes a compact collapsed toolbar', async ({ page }) => {
  await readyApplication(page);
  await page.goto('./');
  await search(page);
  const toggle = page.locator('.kvideo-result-controls-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.kvideo-filter-row')).toBeHidden();
});

test('S21-T07 keeps probe and favorite actions 44px apart without overlap', async ({ page }) => {
  await readyApplication(page);
  await page.goto('./');
  await search(page);
  const cards = page.locator('.kvideo-result-card');
  const first = cards.first();
  const boxes = await first.locator('.kvideo-result-probe, .kvideo-result-favorite').evaluateAll((elements) => (
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    })
  ));
  expect(boxes).toHaveLength(2);
  expect(boxes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  const horizontalGap = Math.max(boxes[1].left - boxes[0].right, boxes[0].left - boxes[1].right);
  const verticalGap = Math.max(boxes[1].top - boxes[0].bottom, boxes[0].top - boxes[1].bottom);
  expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(8);
});
