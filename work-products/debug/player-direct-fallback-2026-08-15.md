# 播放器直连回退证据（2026-08-15）

## 复现

- 生产 Worker 1.1.3 在媒体上游拒绝 Cloudflare 出口时返回 307，但 Hls.js 播放仍停在 `readyState=0`。
- 相同媒体 URL 从用户网络返回 200/206，并带 `Access-Control-Allow-Origin: *`。
- `lib/media/media-client.ts` 无条件生成 `/api/proxy`；`components/player/hooks/useHlsPlayer.ts` 会拒绝非同源媒体 URL，因此 Pages 没有可控的浏览器直连重建路径。
- 生产 Worker 的静态 CSP 仍限制为 `media-src 'self' blob:` 与 `connect-src 'self'`，会继续阻止外部直连；这是发布级阻断项，不属于本次 Pages 授权。

## 根因修复

- 新增 `lib/media/playback-routing.ts`，把普通视频模式明确映射为：
  - `none`：浏览器直连；
  - `retry`：同源 Worker 优先，致命网络失败后回退一次浏览器直连；
  - `always`：始终同源 Worker。
- IPTV 不进入浏览器直连路径。
- Hls.js 在回退时销毁失败实例并用直连 URL 重建；原生媒体也只回退一次，再失败才上报终止错误。
- 跨源媒体请求使用 `credentials: "omit"`，同源 Worker 请求保持 `credentials: "same-origin"`。

## 回归证据

- RED：`node --test work-products/tests/playback-routing.test.mjs` 因旧实现不存在路由策略模块而失败。
- GREEN：同一测试 3/3 通过，覆盖 `retry`、`none`、`always`、IPTV 与不安全 URL。
- 浏览器：目标 Playwright 回归 4/4 通过，包含 HLS Worker 失败后实际请求直连 manifest，以及原生媒体的一次回退/终止链路。
- 完整门禁：`npm run build`、`npm test`（143/143）、`npx tsc --noEmit`、`npm run lint`、`npm run test:e2e`（119/119）和 `npm run release:build` 全部通过。
- Pages 0.2.1 发布产物共 80 个资源，manifest SHA-256 为 `17bc8b70be221be28fb56ad8974075a108060993b37e50a7e12c501f5ce28556`。
- 官方 npm 审计在 high 门槛退出 0；保留 1 个仅影响开发服务器的 low `esbuild` 告警，不使用会强制升级到破坏性版本的 `npm audit fix --force`。
- `git diff --check` 退出 0，变更文件秘密扫描为 0 命中。
- 发布结论为 NO-GO；Worker CSP 未兼容前不得宣称生产真实播放已修复。
