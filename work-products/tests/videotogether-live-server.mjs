import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = 41739;
const html = await readFile(new URL("./videotogether-live-harness.html", import.meta.url));
const exactScript = "https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@5bf6d155db7bdd19f02e7867036e98eee21f62fc/release/extension.website.user.js";
const currentCsp = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline' ${exactScript}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' blob:",
  "connect-src 'self' https://fastly.jsdelivr.net wss://fastly.jsdelivr.net",
  "frame-src 'self' https://fastly.jsdelivr.net",
].join("; ");
const safeCsp = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline' ${exactScript}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' blob: https:",
  ["connect-src 'self'", "https://fastly.jsdelivr.net", "https://videotogether.oss-cn-hangzhou.aliyuncs.com",
    "https://vt.panghair.com:5000", "wss://vt.panghair.com:5000", "https://api.begin0114.wiki"].join(" "),
  "frame-src 'self' https://2gether.video",
].join("; ");
const candidateCsp = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fastly.jsdelivr.net https://release.begin0114.wiki",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' blob: https:",
  ["connect-src 'self'", "https://fastly.jsdelivr.net", "https://videotogether.oss-cn-hangzhou.aliyuncs.com",
    "https://release.begin0114.wiki", "https://vt.panghair.com:5000", "wss://vt.panghair.com:5000",
    "https://api.begin0114.wiki", "https://api.2gether.video", "https://api.panghair.com", "https://2gether.video"].join(" "),
  "frame-src 'self' https://2gether.video",
].join("; ");

createServer((request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": request.url === "/candidate" ? candidateCsp : request.url === "/safe" ? safeCsp : currentCsp,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`VideoTogether live harness: http://127.0.0.1:${port}/current`);
});
