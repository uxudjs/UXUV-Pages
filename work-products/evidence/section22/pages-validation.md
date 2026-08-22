# S22-R17 Pages 全门禁与静态发布物验证

- 时间：2026-08-21T20:23:28.0831451+08:00
- 任务：`S22-R17`
- attempt：`run-20260821-s22-r17-01`
- 结论：GREEN（仅本地 Pages 候选）
- 输入身份：Worker 侧 `work-products/debug/execution-baselines/S22-R17/run-20260821-s22-r17-01/manifest.json` 已通过 v2 manifest 自审计、prewrite 与逐命令 inputs/protected/environment 复验。
- 工具链：Node `v20.19.2`、npm `10.8.2`、Google Chrome `151.0.7922.173`，批准的本地 Playwright/Next/esbuild/ESLint/TypeScript entrypoint 均为普通文件。
- 离线环境：`GIT_OPTIONAL_LOCKS=0`、`PORT=4173`、遥测关闭、视觉候选写入关闭；`TEMP/TMP/TMPDIR` 固定到 `work-products/tests/work/section22-r17-temp/`；所有大小写代理变量均缺失。

## 验证结果

| 检查 | 退出码 | 结果 |
|---|---:|---|
| `npm run lint` | 0 | ESLint 通过 |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | 类型检查通过 |
| `npm run test:e2e` | 0 | 128 pass，0 fail；含普通代理与 CONNECT 的 loopback fail-closed 门禁 |
| build 前远程依赖静态扫描 | 0 | `next/font` 与已知远程字体域名无匹配 |
| `npm run build` | 0 | 8 个静态入口生成；23 个客户端 JavaScript 资产完成 chrome83 转译 |
| `npm run release:build` | 0 | 原子更新 `release/current/`；无 staging/backup 残留 |
| `npm test` | 0 | 主套件 163 pass，Section 21 套件 10 pass，合计 173 pass、0 fail |
| `git diff --check` | 0 | 通过；仅报告工作树行尾提示 |

`release/current/release-manifest.json` 为 schema v1，绑定 Pages `0.3.0`、API Contract `2`、Worker 范围 `>=2.0.0 <3.0.0`，列出 7 个路由与 72 个资产。`.next/`、`out/`、`release/`、`tsconfig.tsbuildinfo`、Playwright artifacts 与隔离视觉草稿已纳入 task target；`kvideo-webview-compatibility`、`pwa-release`、`release-manifest` 三个 Node test-work 均由测试自行回收。任务 temp 保留 Playwright transform cache，主代理未清理。

## 迭代与局限

- 首次创建 temp 使用了当前 PowerShell 不支持的参数，目录未落地；随后在同一已验证父目录中成功创建。两次从 Pages cwd 调用 baseline verify 因 manifest 路径不规范而在 lint 启动前拒绝；改由 Worker cwd 校验后再进入 Pages 执行，未放宽合同。
- 四个并发文件与已批准视觉候选均保持只读，由 terminal verify 再确认。
- GREEN 只证明当前本地 Pages 输入、浏览器套件和静态 release 候选；不代表跨仓最终集成、GitHub Pages、Cloudflare、真实用户会话或生产环境已验证。
- 本任务未安装依赖、联网、执行 commit/push/部署，也未修改远程状态。
