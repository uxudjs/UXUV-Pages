# Pages 0.2.1 播放器直连回退发布门禁

## 结论

**NO-GO**：本地候选与发布产物已通过完整门禁，但当前生产 Worker 1.1.3 的 CSP 会拦截 Pages 新增的外部媒体直连。不得仅推送 Pages 并宣称真实播放已修复。

## 已验证

- 普通视频：`none` 直接请求安全的 HTTP(S) 媒体地址；`retry` 先走 `/api/proxy`，仅在致命网络错误后直连一次；`always` 始终走 Worker。
- IPTV：保持 `/api/iptv/stream`，不进入直连回退。
- HLS：切换来源前销毁失败实例；跨源请求使用 `credentials: "omit"`，同源请求使用 `credentials: "same-origin"`。
- 订阅设置：JSON 订阅按订阅行展示，隐藏其物化内部源；搜索默认合并同名视频，保留用户显式逐源偏好。
- 完整验证：build、143/143 Node 测试、TypeScript、ESLint、119/119 Playwright、release build、high 级 npm 审计、秘密扫描和 `git diff --check` 通过。
- Pages 0.2.1 发布产物：80 个资源；manifest SHA-256 `17bc8b70be221be28fb56ad8974075a108060993b37e50a7e12c501f5ce28556`。

## Blocker

- 2026-08-15 生产响应为 Worker 1.1.3 / Pages 0.2.0。
- CSP 当前为 `media-src 'self' blob:`，会阻止外部 `<video>` 媒体。
- `connect-src` 仅允许同源和固定的 VideoTogether 主机，不允许任意订阅来源的 HTTPS HLS manifest、分片或密钥请求。
- `main` 推送会自动运行 `Publish GitHub Pages` 并覆盖 `gh-pages` 根目录；生产 Worker 又读取该移动根，因此 Pages 推送等同于立即发布不完整修复。

## Recommended

1. 单独授权 Worker CSP 的最小安全边界变更并补回归测试；由于用户可配置任意订阅来源，静态主机白名单无法覆盖该产品契约。
2. 先发布 Worker（建议版本 1.1.4），确认新 CSP 与 Pages 0.2.0 兼容。
3. 再推送 Pages 0.2.1，等待 GitHub Pages 工作流成功。
4. 核对 `/api/config` 和响应头版本，再在已登录浏览器验证搜索、来源切换与真实播放进度。

## Acknowledged

- 官方 npm 审计剩余 1 个 low `esbuild` 开发服务器告警；仓库只在测试中调用 `build()`，生产是静态导出。强制修复会升级到破坏性版本，本次不处理。
- 应用内浏览器控制运行时因本机路径缺失而无法启动；生产浏览器验证仍未执行。

## 回滚

- Pages：revert 本次提交并推送，等待同一工作流恢复上一份 `gh-pages` 产物。
- Worker：如 CSP 更新异常，重新部署已知的 Worker 1.1.3；Pages 0.2.0 在旧 CSP 下保持现状。
