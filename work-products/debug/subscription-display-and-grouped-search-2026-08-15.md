# JSON 订阅展示与同名搜索聚合

## 复现

- 生产 Pages 0.2.0 / Worker 1.1.3 的账户配置版本为 16：79 个来源、1 条 JSON 订阅；订阅记录关联 78 个 `sourceIds`。
- 设置页把 78 个订阅内部源和 1 个重复 JSON 链接源都按个人源逐项展示，同时搜索显示方式默认选择逐源展示。

## 根因

- `SourceSettings` 与 `UserSourceSettings` 直接渲染 `config.sources`，没有排除订阅 `sourceIds` 或与订阅 URL 相同的误存来源。
- 手动订阅导入保留了解析器的 `personal` 类型，没有标记为系统管理源。
- `useSearchDisplayModePreference` 在没有显式账户偏好时默认返回 `normal`；同名分组、短 `gs` 缓存和播放器来源切换逻辑其实已经存在。

## 最小修复

- 仅在设置展示层隐藏订阅管理的内部源和重复 JSON 链接源；D1 中的物化源不删除，搜索数据不丢失。
- 视频源管理改为显示 JSON 订阅名称、原始 URL 和内部来源数量；独立来源仍可单独管理。
- 新订阅解析出的来源标记为 `system`。
- 新账户或未设置偏好的账户默认合并同名视频；显式选择逐源显示的账户仍保留该选择。

## RED / GREEN

- RED：新增契约后，缺少 `standaloneSources`、默认仍为 `normal`、订阅导入仍为 `personal`，目标测试 4/7 通过、3/7 失败。
- GREEN：目标契约 7/7；完整 Node 测试 140/140；TypeScript、ESLint、`git diff --check` 通过。
- 针对性浏览器回归 8/8；完整端到端回归 118/118。覆盖 JSON 订阅展示/更新/删除、来源管理、默认同名聚合、显式逐源模式、筛选排序和播放器分组导航。

## 边界

- 本轮没有修改账户 D1 数据、Worker、Secrets 或订阅 URL。
- 本轮只完成本地 Pages 修复与测试；未 commit、未 push、未发布 GitHub Pages，也未更新 Worker 的 Pages 固定产物。
