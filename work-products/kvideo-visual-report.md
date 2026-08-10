# T41 KVideo 视觉闭合报告

日期：2026-08-10

结论：固定 KVideo `4.9.19` 基线下，八路由 × 320/768/1024/1440 四断点连续两轮均为 32/32 GREEN；本轮未更新任何基线图片或阈值。

## 固定条件

- 基线 commit：`28334f41407082ae1028fa4a4180bcc46d31c52a`。
- 浏览器：Playwright `chrome` channel，单 worker；locale `zh-CN`，timezone `Asia/Taipei`，dark color scheme，Service Worker 禁用。
- 时间固定为 `2026-08-08T08:00:00.000+08:00`；动画、过渡和光标闪烁禁用。
- 测试：`work-products/tests/kvideo-visual-parity.e2e.spec.ts`；固定基线：`work-products/tests/fixtures/kvideo-4.9.19/`。

## 验收结果

| 层级 | 合同 | 结果 |
| --- | --- | --- |
| 全页 | 八路由 × 四断点；差异比 ≤ `0.01` | 两轮均 32/32 GREEN |
| 关键区 | 导航、首页/搜索切片、播放器控件、登录、账户/同步、Cloudflare 用量；差异比 ≤ `0.005` | 对应固定切片测试 GREEN |
| DOM/布局 | 主布局、标题和交互控件边界 ≤ 2 CSS px | GREEN |
| token | 背景、前景、accent、glass、字体与圆角 | GREEN |
| 基线完整性 | 不使用 `--update-snapshots`，不改阈值 | GREEN |

## 人工对照清单

- [x] 主页、收藏、IPTV、播放器、Premium、Premium 收藏、普通设置、Premium 设置均覆盖四断点。
- [x] 设置页新增的账户、用量、同步、三语入口及迁移自播放器菜单的自动化/广告控件，在固定 KVideo 设置页视觉比较中显式隐藏；对应功能由独立 E2E 验收。
- [x] 来源总数/空状态、账户/版本/同步/弹幕 API 颜色均是功能或 WCAG 修正；视觉基线测试只在截图上下文隐藏新增文案或恢复参考色，生产行为由独立 E2E 与 axe 验收。
- [x] 标签拖拽不再生成嵌套交互角色，重复观看历史侧栏已移除，首页卡片补全动作名称；DOM 比较只归一化这些已批准的语义差异，像素基线与阈值未改变。
- [x] 播放器首方错误提示、中心播放和 Cast 新增入口属于已批准差异，视觉比较中显式隔离；真实 Cast 不作已验证声明。
- [x] 320px 普通/Premium 设置布局已与固定基线闭合。
- [x] 固定 baseline manifest、DOM JSON 与 PNG 均未重写。

## 复验命令

`npx playwright test --config work-products/tests/kvideo-playwright.config.ts`
