# 合译 · Cowork Translation

中英互译工坊。五个智能体起草、标风险、对照批改；交稿仍由译员签发。

合译不是一键出稿的机器翻译。规划先立翻译护照，术语只锁已审核条目，翻译按约束起草，语体润色但不改事实，风险过六关后再由你签发。练习页把原文、参考译文和自己的译文放在同一张桌上，从翻译批评与鉴赏对照批改，再由你决定要不要写出一篇跟你语体一致、对等更高的优化稿。

工序、文案、术语和密钥约定见 [GUIDELINE.md](./GUIDELINE.md)。

## 能做什么

- **实战翻译**：中译英 / 英译中。规划 → 术语 → 翻译 → 语体 → 风险 → 译者签发。
- **翻译练习**：上传原文、参考译文和自己的译文，五智能体批改；点「优化」后再决定要不要产出优化稿。
- **术语表**：机构名与缩略词已入库。还可上传、从原文与译文提取候选，审核后才写入。
- **博客**：四类各五篇，从译论抽出工坊用得上的方法，不代替读原书。
- **一次免费体验**：站点承担一次五智能体运行。之后在设置填写你自己的密钥。密钥只存在这台浏览器。

## 页面

| 路径 | 作用 |
| --- | --- |
| `/` | 首页 |
| `/workshop` | 实战翻译 |
| `/practice` | 翻译练习 |
| `/glossary` | 术语表 |
| `/guide` | 合译流程 |
| `/faq` | 常见问题 |
| `/blog` | 博客 |
| `/settings` | 模型密钥 |
| `/terms` | 用户协议 |
| `/privacy` | 隐私政策 |

折叠菜单展开后，每一栏都进入对应落地页。练习只从菜单进入，不放在页脚。

## 本机运行

```bash
git clone https://github.com/zyy030920/co-tranlste.git
cd co-translate
npm install
```

复制环境文件（Windows PowerShell 用 `Copy-Item`）：

```bash
cp .env.example .env.local
```

编辑 `.env.local`。不要把这枚密钥写进仓库。

```
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3
```

国际站用 `https://api.minimax.io/v1`。国内站用 `https://api.minimaxi.com/v1`。不要填 `/anthropic`。

```bash
npm run dev
```

浏览器打开 [http://127.0.0.1:43173](http://127.0.0.1:43173)。

使用者自己的密钥在「设置」填写，保存在浏览器本地，不会写入服务器配置。

```bash
npm run build
npm start
```

## 不要提交

- `.env.local` 和任何真实 API Key
- `node_modules/`、`.next/`
- `.tmp-extract/`（本地 PDF 抽取缓存）
- `vendor/live-panel-skill/`（技能源码；运行时副本在 `public/live-panel/`）

`.gitignore` 已覆盖以上路径。提交前用 `git status` 再看一遍。
