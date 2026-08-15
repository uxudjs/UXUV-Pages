# Pages 播放器直连回退发布计划（2026-08-15）

## 目标与范围

- 修复普通视频播放器三种代理模式与实际网络路径不一致的问题。
- `none` 直接使用经详情接口返回的 HTTP(S) 媒体地址。
- `retry` 先使用同源 `/api/proxy`，仅在网络加载终止后回退一次到原媒体地址。
- `always` 与 IPTV 保持同源 Worker 路径，不增加直连回退。
- 保留当前工作树中已验证的订阅 JSON 展示与同名结果聚合改动。

## 验收标准

1. 新增路由策略回归测试，旧实现失败，修复后通过。
2. 浏览器回归证明 `retry` 首次失败切换为直连，直连再次失败才上报终止错误；`none` 从直连开始；`always` 仍为同源代理。
3. `npm test`、类型检查、lint、全量 Playwright、release build、依赖审计、秘密扫描与 `git diff --check` 通过。
4. GitHub Pages 发布完成且公开 manifest/产物身份可核对。
5. 生产 Worker CSP 允许所需的 HTTPS 媒体与 HLS 请求，并在登录浏览器验证真实播放进度；未满足时发布门禁为 NO-GO。

## 发布与回滚

- Pages：提交并推送 `main`，等待 `Publish GitHub Pages` 工作流发布 `gh-pages`。
- 回滚：revert 本次 Pages 提交并推送，等待同一工作流恢复上一产物。
- Worker CSP 或部署不属于本次 Pages 授权；如需修改，必须另行确认并保留 Worker 1.1.3 回滚入口。
