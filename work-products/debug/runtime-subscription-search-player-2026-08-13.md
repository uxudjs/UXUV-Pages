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

## 复审追加：初始化竞态、失败重试与批量持久化

### RED

在同一测试文件补充四项回归，修复前稳定失败：

- `config` 文档仍在拉取时，即使 `library` 已失败，也不得提前导入运行时订阅。
- 运行时订阅未完成时，搜索和首页影片按钮必须保持禁用。
- 首次导入失败后，窗口重新聚焦必须重试，并在成功后清除 `lastError`。
- 重复订阅 URL 只导入一次；20 个来源必须通过一次批量配置写入持久化。

### 根因与最小修复

- `SyncProvider` 原先只暴露聚合 `phase`；任一集合先结束就可能让订阅同步误判为“初次同步完成”。现改为显式暴露 `configReady`。
- `RuntimeSourceSync` 原先使用一次性的 `attemptedRef` 且不向页面暴露状态，失败会永久停留，搜索和首页点击也会与来源导入竞态。现增加 `loading / ready / error` 状态，并在 `online`、`focus` 时重试。
- 订阅 URL 原先未规范化去重，且每个来源分别调用一次配置写入。现按规范化 URL 去重，并通过一次 `upsertRecords("config", updates)` 原子更新来源与订阅记录。
- 所有订阅均失败时保持交互禁用并显示可恢复错误；部分成功仍按既有 KVideo 合同允许使用成功来源，同时保留失败记录供后续重试。

### GREEN

- 新增回归：4/4；该测试文件：14/14。
- `npm test`：139/139。首次全量运行出现一次 Windows 文件锁 `EPERM`，对应测试单独重跑及全量重跑均通过，因此归类为瞬态环境问题。
- `npm run test:e2e`：116/116。
- `npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check`：通过。
- 仍未修改 Worker、D1 schema、Secret、版本号或发布配置；未 commit、push 或部署。

## 生产复核修正：个人订阅入口

### 观察与根因

- 生产 Worker 实际未配置 `SUBSCRIPTION_SOURCES`；现有变量只有认证相关配置与 D1 绑定。
- 当前账户把订阅清单 URL 保存成了一个个人 `VideoSource`，所以搜索把 `VideoSource[]` 清单当成 CMS 搜索响应并判为无效。
- 个人订阅本应由网页的订阅导入流程写入账户隔离的 D1 `config.subscriptions` 与 `config.sources`；`SUBSCRIPTION_SOURCES` 只用于管理员提供全局默认订阅。
- 现有网页虽有完整订阅弹窗，但入口藏在“添加源”弹窗的二级“导入”动作中，用户容易把订阅 URL 填进“接口地址”。

### RED 与最小修复

- 将 `../tests/kvideo-source-import.e2e.spec.ts` 改为从“视频源管理”直接打开导入器；修复前因 `.source-import-button` 不存在而超时失败。
- 在 `../../components/settings/SourceSettings.tsx` 的来源标题操作区增加直接“导入”按钮，复用原有导入、订阅、D1 同步与安全边界，不增加 Worker 明文变量。
- 记录实际触发入口，关闭导入弹窗后把焦点归还给该入口；从旧的“添加源”二级入口进入时仍返回“添加源”。

### GREEN 与边界

- `npx playwright test work-products/tests/kvideo-source-import.e2e.spec.ts --reporter=line`：1/1。
- `npm test`：139/139；`npm run test:e2e`：118/118。
- `npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check`：通过。
- 生产浏览器已确认现有误配置和缺失的直接入口；浏览器控制在导出/迁移过程中连续超时，因此没有冒险删除或覆盖 D1 数据，也未声称生产搜索或播放已恢复。
- 未修改 Worker、D1 schema、Secret、版本号或发布配置；未 commit、push 或部署。
