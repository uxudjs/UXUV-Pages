# T42 / CP7 本地 Pages 候选门

日期：2026-08-10

结论：**GO（仅 CP7 本地候选）**。`0.2.0` 的内容、构建、浏览器和视觉门已闭合；这不代表已创建候选 commit、已上传 Actions artifact、已发布 Pages 或已部署 Worker。

## 本地身份

| 项目 | 观测值 | 证据边界 |
| --- | --- | --- |
| Pages 版本 | `0.2.0` | 新不可变候选；没有覆盖 `0.1.2` |
| UXUV-Pages base HEAD | `4bc847affa76755a5c99ce249d793aa43e0b83bb` | 工作树含未提交迁移；不是候选 commit |
| lock SHA-256 | `1c22c29d7fee717244d0a82bca247bfd748dce97cf579f9bb3d280b2c28867c6` | 当前本地 `package-lock.json` |
| 验证清单 SHA-256 | `c0931c5b05df3579ef2cf10d5348a6e4a1b4dedc4e694ddce6b61d07dc4e3a80` | 两次独立生产构建后相同；使用 base HEAD 仅作本地可复现性哨兵 |
| 清单资产数 | `80` | 八个静态业务路由及全部发布资产 |
| Worker base HEAD | `e7e397e520f90433f98eb1f929fc5d135bacfec0` | Worker 工作树也未提交 |
| `_worker.js` SHA-256 | `456f59cedc6cb0a9eb90467f6c02f35cb8b0befd8b335d6f5f5f7fe116eaf60e` | 当前本地单文件精确字节 |

## 发布身份合同

- `.github/workflows/pages.yml` 仅允许手动输入完整 `expectedCommit`，校验其等于 `GITHUB_SHA`，并在该提交构建前后执行身份验证。
- artifact 由清单覆盖的不可变版本目录生成，清单包含路径、SHA-256、SRI、MIME、Pages 版本、完整 commit、API contract 与 Worker range。
- `actions/upload-artifact` 固定到完整 commit；SHA 不匹配、清单漏项、MIME/哈希漂移或同版本字节变化均失败关闭。

## 本地验证

### UXUV-Pages

- `npm run lint`：PASS，0 error。
- `npx tsc --noEmit`：PASS。
- `npm test`：128/128 PASS。
- `npm run test:e2e`：105/105 PASS。
- KVideo 固定视觉矩阵：连续两轮均 32/32 PASS；未更新图片或阈值。
- `npm run build`：连续两次 PASS；每次转译 27 个客户端资产到 Chrome/WebView 83 语法边界。
- 两次验证清单：SHA-256 均为 `c0931c5b…3a80`，80 个资产。
- `git diff --check`、秘密值模式扫描、机器绝对路径扫描：PASS；仅有 Git 的 LF→CRLF 工作树提示。

### UXUVideo

- `node --check _worker.js`：PASS。
- `npm test`：88/88 PASS。
- `npm run check:size`：PASS；源码 `157400` bytes，gzip `37813 / 3145728` bytes。
- `git diff --check`、秘密值模式扫描、机器绝对路径扫描：PASS；仅有 Git 的 LF→CRLF 工作树提示。

### 功能与视觉闭合

- 273 个能力 ID：272 `pass`、1 `approved-difference`、0 `unverified`。
- 八路由 × 四断点视觉、DOM、设计 token、WCAG AA、键盘/TV 模拟、同源网络和 105 项浏览器行为门均通过。

## 尚未授权或尚未证明

1. 当前 `0.2.0` 没有 Git commit/tree 身份，不能生成或发布声称绑定精确候选 commit 的远端 artifact。
2. `0.2.0` 尚未发布；当前 Worker 仍固定已发布的 `0.1.2`。因此现在复制 `_worker.js` 可以运行既有 `0.1.2`，但不会得到本轮 `0.2.0` 新界面。
3. T43-T48 的 commit、push、Pages 发布、Worker pin 更新、Cloudflare 上传、D1/Secret 与最终 ship 门继续 HOLD。
4. 本地模拟不等于真实 Cast、PWA 安装、电视/WebView、Cloudflare Analytics、生产媒体或真实 D1 证据；这些由用户部署后验收。

## 下一授权点

T43 需要单独授权提交 UXUV-Pages，以冻结 commit/tree；T44 需要单独授权 push 和 Pages 发布。只有 T44 公网身份链通过后，T45 才能把本地 Worker pin 更新到 `0.2.0`，形成“复制单个 `_worker.js` 后使用新版界面”的候选。
