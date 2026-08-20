import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 4173);
const reviewFixture = process.env.SECTION21_REVIEW_FIXTURE === "1";
const githubPagesBasePath = "/UXUV-Pages";
const outRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..", "out");
const githubPagesEntry = resolve(dirname(fileURLToPath(import.meta.url)), "../..", "public", "github-pages.html");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);
const session = {
  accountId: "section21-review-v2", profileId: "section21-review-v2", username: "review",
  name: "Section 21 Review", role: "super_admin", customPermissions: [], mode: "managed",
};
const sources = [
  { id: "section21-standard-a", updatedAt: 1, name: "Review Source A", baseUrl: "https://review-a.invalid", enabled: true, group: "normal", priority: 1 },
  { id: "section21-standard-b", updatedAt: 1, name: "Review Source B", baseUrl: "https://review-b.invalid", enabled: true, group: "normal", priority: 2 },
  { id: "section21-premium", updatedAt: 1, name: "Review Premium", baseUrl: "https://review-premium.invalid", enabled: true, group: "premium", priority: 1 },
];
let configDocument = {
  kind: "config", version: 1, updatedAt: 1,
  payload: { fields: {
    theme: { value: "dark", updatedAt: 1 }, locale: { value: "zh-CN", updatedAt: 1 }, proxyMode: { value: "always", updatedAt: 1 },
  }, sources, subscriptions: [], tombstones: [] },
};
let libraryDocument = {
  kind: "library", version: 1, updatedAt: 1,
  payload: { history: [], favorites: [], tombstones: [] },
};
const capability = { profile: "paid", limits: { sources: 32, searchConcurrency: 6, maxPages: 3, videos: 2000, probeVideos: 50, probeConcurrency: 6, probeVariants: 4 } };

function json(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Cache-Control": "no-store", "Content-Length": bytes.length, "Content-Type": "application/json; charset=utf-8",
  });
  response.end(bytes);
}

async function requestJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new Error("fixture body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function silentWav() {
  const sampleRate = 8_000;
  const dataBytes = sampleRate * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataBytes, 40);
  return wav;
}
const reviewMedia = silentWav();

function media(response, request) {
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const requestedEnd = range?.[2] ? Number(range[2]) : reviewMedia.length - 1;
  const end = Math.min(reviewMedia.length - 1, requestedEnd);
  if (!Number.isInteger(start) || start < 0 || start > end) {
    response.writeHead(416, { "Content-Range": `bytes */${reviewMedia.length}` }).end();
    return;
  }
  const body = reviewMedia.subarray(start, end + 1);
  response.writeHead(range ? 206 : 200, {
    "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "audio/wav",
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${reviewMedia.length}` } : {}),
  });
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

function events(response, values) {
  const body = Buffer.from(values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join(""));
  response.writeHead(200, {
    "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "text/event-stream; charset=utf-8",
  });
  response.end(body);
}

async function handleReviewFixture(request, response, url) {
  if (!reviewFixture) return false;
  const path = url.pathname;
  if (path === "/__section21/review.wav" || path === "/api/proxy") {
    media(response, request);
    return true;
  }
  if (!path.startsWith("/api/")) return false;
  if (path === "/api/config") json(response, 200, {
    release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
    site: { name: "UXUVideo", title: "UXUVideo", description: "Section 21 local review fixture", iconUrl: "/icon.png" },
    capabilities: { premium: true, danmaku: true }, adKeywords: [],
    thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
  });
  else if (path === "/api/auth/session") json(response, 200, { authenticated: true, session });
  else if (path === "/api/user/config" || path === "/api/user/sync") {
    const key = path.endsWith("config") ? "config" : "library";
    if (request.method === "POST") {
      const body = await requestJson(request);
      const current = key === "config" ? configDocument : libraryDocument;
      const next = { ...current, version: current.version + 1, updatedAt: current.updatedAt + 1, payload: body.payload ?? current.payload };
      if (key === "config") configDocument = next;
      else libraryDocument = next;
    }
    json(response, 200, key === "config" ? configDocument : libraryDocument);
  }
  else if (path === "/api/app-update") json(response, 200, {
    status: "up-to-date", currentVersion: "2.0.0", latestVersion: "2.0.0",
    checkedAt: "2026-08-19T00:00:00.000Z",
  });
  else if (path === "/api/auth/accounts") json(response, 200, {
    loginMode: "managed", managed: true, accounts: [{ id: session.accountId, ...session, createdAt: 1, updatedAt: 1 }], totalCount: 1,
  });
  else if (path === "/api/admin/usage") json(response, 200, {
    data: { configured: false, missing: [], message: "Section 21 local review fixture" },
  });
  else if (path === "/api/douban/tags") json(response, 200, { tags: ["热门", "科幻", "纪录片"] });
  else if (path === "/api/douban/recommend") json(response, 200, { subjects: [
    { id: "review-1", title: "Section 21 Ready Player", cover: "/placeholder-poster.svg", rate: "9.1", url: "" },
    { id: "review-2", title: "Section 21 Documentary", cover: "/placeholder-poster.svg", rate: "8.8", url: "" },
  ] });
  else if (path === "/api/search-parallel") events(response, [
    { type: "start", totalSources: 2, capability },
    { type: "videos", source: "section21-standard-a", videos: [
      { vod_id: "review-movie", vod_name: "Section 21 Ready Player", vod_pic: "/placeholder-poster.svg", vod_year: "2026", type_name: "剧情", vod_lang: "国语", sourceDisplayName: "Review Source A" },
      { vod_id: "review-documentary", vod_name: "Section 21 Documentary", vod_pic: "/placeholder-poster.svg", vod_year: "2025", type_name: "纪录片", vod_lang: "英语", sourceDisplayName: "Review Source A" },
    ] },
    { type: "videos", source: "section21-standard-b", videos: [
      { vod_id: "review-movie-b", vod_name: "Section 21 Ready Player", vod_pic: "/placeholder-poster.svg", vod_year: "2026", type_name: "剧情", vod_lang: "粤语", sourceDisplayName: "Review Source B" },
    ] },
    { type: "progress", completedSources: 2, totalVideosFound: 3 }, { type: "complete" },
  ]);
  else if (path === "/api/premium/types") json(response, 200, { tags: [
    { id: "recommend", label: "今日推荐", value: "" }, { id: "documentary", label: "纪录片", value: "documentary" },
  ], capability });
  else if (path === "/api/premium/category") json(response, 200, { videos: [
    { vod_id: "premium-review", vod_name: "Section 21 Premium", vod_pic: "/placeholder-poster.svg", vod_year: "2026", type_name: "纪录片", vod_lang: "国语", source: "section21-premium", sourceName: "Review Premium" },
  ], capability });
  else if (path === "/api/detail") {
    const body = await requestJson(request);
    const sourceId = body?.source?.id ?? "section21-standard-a";
    json(response, 200, { success: true, data: {
      vod_id: body?.id ?? "review-movie", vod_name: "Section 21 Ready Player", source: sourceId,
      vod_pic: "/placeholder-poster.svg", vod_remarks: "API 2 local review fixture", vod_content: "Deterministic local player review.",
      vod_year: "2026", vod_area: "本地", vod_lang: "国语", vod_actor: "Review Actor", vod_director: "Review Director", type_name: "剧情",
      episodes: [
        { name: "第一集", url: `http://127.0.0.1:${port}/__section21/review.wav`, index: 0 },
        { name: "第二集", url: `http://127.0.0.1:${port}/__section21/review.wav`, index: 1 },
      ],
    } });
  }
  else if (path === "/api/probe-resolution") events(response, [
    { type: "start", capability }, { id: "review-movie", source: "section21-standard-a", resolution: { width: 1920, height: 1080, label: "1080P" } }, { done: true },
  ]);
  else if (path === "/api/ping") json(response, 200, { success: true, latency: 24 });
  else json(response, 404, { error: { code: "NOT_FOUND" } });
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (await handleReviewFixture(request, response, url)) return;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === githubPagesBasePath || pathname.startsWith(`${githubPagesBasePath}/`)) {
      const metadata = await stat(githubPagesEntry);
      response.writeHead(200, {
        "Content-Length": metadata.size,
        "Content-Type": "text/html; charset=utf-8",
      });
      createReadStream(githubPagesEntry).pipe(response);
      return;
    }
    let relativePath = pathname.replace(/^\/+/, "");
    if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
    let filePath = resolve(outRoot, relativePath);
    if (filePath !== outRoot && !filePath.startsWith(`${outRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    let metadata = await stat(filePath);
    if (metadata.isDirectory()) {
      filePath = resolve(filePath, "index.html");
      metadata = await stat(filePath);
    }
    response.writeHead(200, {
      "Content-Length": metadata.size,
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    try {
      const fallbackPath = resolve(outRoot, "404.html");
      const metadata = await stat(fallbackPath);
      response.writeHead(404, {
        "Content-Length": metadata.size,
        "Content-Type": "text/html; charset=utf-8",
      });
      createReadStream(fallbackPath).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  }
});

server.listen(port, "127.0.0.1");
