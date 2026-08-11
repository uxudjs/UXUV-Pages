const CACHE_PREFIX = "uxuv-static-";
const CACHE_NAME = "uxuv-static-0.2.0";
const LEGACY_CACHE_PREFIXES = ["video-cache-"];
const STATIC_DESTINATIONS = new Set(["document", "font", "image", "manifest", "script", "style"]);
const STATIC_EXTENSION = /\.(?:css|html|ico|js|json|mjs|png|svg|webmanifest|woff2?)$/i;
const MEDIA_EXTENSION = /\.(?:aac|flac|m3u8?|m4s|mp3|mp4|ts|wav|webm)$/i;

function mayCache(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return false;
  if (["audio", "video"].includes(request.destination) || MEDIA_EXTENSION.test(url.pathname)) return false;
  return request.mode === "navigate"
    || STATIC_DESTINATIONS.has(request.destination)
    || STATIC_EXTENSION.test(url.pathname);
}

function responseMayBeCached(response) {
  const policy = response.headers.get("Cache-Control") || "";
  return response.ok && response.type !== "opaque" && !/private|no-store/i.test(policy);
}

async function cacheResponse(cache, request, response) {
  if (!responseMayBeCached(response)) return;
  try {
    await cache.put(request, response.clone());
  } catch {
    // Cache quota or storage failures must not replace a valid network response.
  }
}

async function refreshNavigation(request, cache) {
  try {
    const response = await fetch(request);
    await cacheResponse(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((cacheNames) => Promise.all(cacheNames
      .filter((cacheName) => (
        (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
        || LEGACY_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix))
      ))
      .map((cacheName) => caches.delete(cacheName))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (!mayCache(event.request)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    if (event.request.mode === "navigate") return refreshNavigation(event.request, cache);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    await cacheResponse(cache, event.request, response);
    return response;
  }));
});
