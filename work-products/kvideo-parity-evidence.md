# T40 功能对照闭合证据

结论：273 个固定 KVideo 用户能力 ID 已闭合为 272 个 `pass` 与 1 个既有 `approved-difference`，零 `unverified`。本文件只聚合既有 RED/GREEN 证据，不把用户部署后的 Cloudflare、真实媒体或真实设备状态写成本地通过。

## 本轮闭合的 32 项

| ID | 主要 GREEN 证据 |
| --- | --- |
| GLB-001–GLB-004 | `global-shell-contract.test.mjs`、`kvideo-global-shell.e2e.spec.ts`、`runtime-config-contract.test.mjs`、固定视觉基线 |
| GLB-005–GLB-009 | `settings-preferences-contract.test.mjs`、`kvideo-settings-preferences.e2e.spec.ts` |
| GLB-010–GLB-014 | `global-shell-contract.test.mjs`、各模态 E2E、`accessibility.e2e.spec.ts`、固定视觉基线 |
| SEA-001 | `kvideo-home-search-parity.e2e.spec.ts`、`kvideo-search-results.e2e.spec.ts`、`app-flows.e2e.spec.ts` |
| PLY-A001 | `desktop-player-contract.test.mjs`、`player-shell-contract.test.mjs`、`kvideo-desktop-player.e2e.spec.ts` |
| PLY-C010–PLY-C012 | `mobile-device-player-contract.test.mjs`、`kvideo-desktop-player.e2e.spec.ts`；真实设备由用户验收 |
| SET-001、SET-003 | 设置合同与标准/Premium 设置 E2E、固定设置页 DOM/视觉基线 |
| PWA-003 | `pwa-contract.test.mjs`、`kvideo-pwa.e2e.spec.ts`；真实安装由用户验收 |
| DAT-004–DAT-006 | `sync-client.test.mjs`、`app-flows.e2e.spec.ts` 的账户/模式隔离、文档过大、D1 配额与恢复场景 |
| DAT-008–DAT-010 | `kvideo-data-settings.e2e.spec.ts` 的更新可用、无需更新、领先远端与失败重试场景 |
| EXT-001–EXT-003 | `kvideo-desktop-player.e2e.spec.ts`、Worker RuntimeConfig/CSP 合同和 T39 内置浏览器临时房间证据 |
| EXT-004 | Cast SDK mock 的连接/加载/断开与同源媒体 URL 合同；真实 Cast 由用户验收 |

## 自动门

- `kvideo-feature-parity.test.mjs` 重新验证 273 个唯一 ID、目标映射、状态集合、非空闭合说明和零 `unverified`。
- 每项仍保留 T02 中针对固定 UXUV-Pages `0.1.2` 的原始 RED 行；本轮没有重写 RED 基线。
- 平台/硬件项的 `pass` 只表示首方实现与平台 API 合同通过，不表示已在用户的真实设备或 Cloudflare 实例运行。
