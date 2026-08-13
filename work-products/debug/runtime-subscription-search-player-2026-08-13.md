# 运行时订阅导致搜索为空与首页不跳播放器

## 观察与复现

- 生产 Edge 打开 `https://uxuv.uxudjs.dpdns.org/` 后，点击首页“痴迷”仍停留在根路径并显示“没有找到匹配结果”。
- 控制台无前端异常；设置页把运行时 URL 显示为单个名为“视频”的系统源。
- 该 URL 返回 `VideoSource[]` 订阅清单，不是返回 `{ list: Video[] }` 的 CMS 搜索接口。

## 根因

- Worker 的 `SUBSCRIPTION_SOURCES` 合同返回订阅 JSON/URL 列表。
- KVideo 4.9.19 会先同步运行时订阅，再把清单中的真实 CMS 接口用于搜索。
- 迁移版缺少运行时订阅同步，只会搜索 D1 `config.sources`；订阅清单 URL 因此被当作 CMS 接口。
- Worker 对每个并行源采用部分成功策略，单源响应结构错误被隔离，最终以零结果完成，所以搜索和首页卡片解析播放源同时失败。

## RED

新增 `../tests/kvideo-home-search-parity.e2e.spec.ts` 回归：运行时配置提供订阅 URL、D1 中保留误迁移的清单占位源。修复前 5 秒内没有 `/api/source-import` 请求，测试失败。

## 最小修复

- 新增 `../../components/RuntimeSourceSync.tsx`，仅在认证后且 D1 初次同步完成后运行。
- 兼容 KVideo 的 JSON 数组、单 URL、逗号分隔 URL 三种 `SUBSCRIPTION_SOURCES` 格式。
- 继续通过认证同源 `/api/source-import` 受控读取，不允许浏览器直连第三方，也不改变 Worker SSRF、认证或大小限制。
- 展开的来源作为 system source 写入现有同步文档；五分钟内不重复拉取，多个订阅允许部分成功。
- `../../components/PasswordGate.tsx` 在既有 `SyncProvider` 内挂载一次，不改变页面或播放器路由。

## GREEN

- 新回归同时证明手动搜索显示结果卡，以及首页卡片进入带真实 `source` 的 `/player`。
- 对订阅清单中优先级 3、4 的真实 CMS 接口只读抽查：“痴迷”分别返回 5 条和 2 条，优先级 4 的结果含精确标题“痴迷”，证明修复后存在可解析的真实播放候选。
- `npm test`：139/139。
- `npx playwright test work-products/tests/kvideo-home-search-parity.e2e.spec.ts`：10/10。
- `npm run test:e2e`：112/112。
- `npm run lint`：通过。
- 未修改 Worker、D1 schema、Secret、版本号、发布配置；未 commit、push 或部署。
