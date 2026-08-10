# T39 第三方能力证据

日期：2026-08-10

结论：**VideoTogether 的本地产品适配与受控真实房间流程通过。Google Cast 的首方平台 API 合同通过确定性 SDK mock；真实 Cast 设备由用户部署后验收，不阻塞可复制 `_worker.js` 的本地交付，也不声明已完成真实设备验证。**

## 交付边界

- UXUVideo 与 CfGfwAX 一样，交付一个可复制到 Cloudflare 的 `_worker.js`；用户负责 Cloudflare 部署、D1/Secret 配置和真实设备验收。
- VideoTogether 顶层脚本 URL 已固化进 Worker，无需用户另行提供；部署管理员可用 `VIDEOTOGETHER_ENABLED=false` 或 `0` 关闭。
- 账户内“一起看”开关默认关闭。用户开启后，脚本只在播放器和 IPTV 页面加载。
- 本地通过不等于 Cloudflare、生产媒体或真实 Cast 已验证。

## VideoTogether 身份与真实流程

- 官方固定入口：`https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@5bf6d155db7bdd19f02e7867036e98eee21f62fc/release/extension.website.user.js`
- 固定入口大小：30,456 bytes。
- SHA-256：`4a4eb44eb4b822319348067a02f06574a6590af9efab9d73e7a4a6b6a2fbd1e9`。
- Codex 内置浏览器完成无密码临时房间创建、第二标签加入、不存在房间失败和退出流程。
- 产品适配使用官方异步 `window.videoTogetherExtension.CreateRoom/JoinRoom`，并在调用第三方接口前验证 3–64 字符房间 ID。

## 安全边界

- Worker CSP 只在功能启用时加入精确脚本 URL及所需连接源；显式非法自定义 URL 失败关闭。
- 房间 ID 不写入 URL、localStorage、sessionStorage、Worker API 或日志。
- 固定顶层 loader 仍会请求 VideoTogether 维护的动态二级资源；这不是首方 Pages 完整性范围。README 与设置界面保留该边界，部署管理员可关闭功能。
- 未加入 `'unsafe-eval'`，未放宽首方媒体同源边界。

## Google Cast

- `useCastControls` 的确定性 SDK mock 覆盖可用/不可用、连接、加载和断开入口，并验证发送给 Cast 的媒体 URL 仍为同源 `/api/proxy`。
- Codex 内置浏览器没有真实 `chrome.cast` 会话，也没有用户指定的 Cast 设备。
- 用户在实际 Worker 域名上按应用可解释状态完成真实设备验收；该结果与本地实现证据分层记录。

## 回归

- UXUV-Pages 的 VideoTogether/播放器设置 E2E 覆盖默认关闭、账户开启、管理员禁用、加载成功/失败、创建、加入、配置、官方异步 API 与三语/键盘/TV 操作。
- UXUVideo 的 RuntimeConfig/CSP 合同覆盖零额外变量默认可用、显式关闭、自定义 HTTPS URL 和非法覆盖失败关闭。
