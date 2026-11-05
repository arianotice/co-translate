# 合译 · Cowork Translation

> 五个智能体起草，译员签发。

合译是给翻译家和翻译学习者用的中英互译工坊：规划、术语、翻译、语体、风险各管一段，交稿仍由人签。

客户丢来一部三编的书，只译其中一编。机器常把“下编”写成 "Part Two"。你先写清书名和全书结构，合译按你给的背景译“编”，术语由模型初判、你删改后再锁，长文一次导入、按段译完再拼合——不必把书切碎上传。

仓库：[arianotice/co-translate](https://github.com/arianotice/co-translate) · 约定见 [GUIDELINE.md](./GUIDELINE.md)

## 目录

- [这是什么](#-这是什么)
- [功能](#-功能)
- [对话示例](#-对话示例)
- [在线演示](#-在线演示)
- [目录结构](#-目录结构)
- [本机运行](#-本机运行)
- [页面](#-页面)
- [不要提交](#-不要提交)

## 📌 这是什么

中英互译，只做这一对方向。五个智能体只起草、只标风险，不替你交稿。术语表在你审核之前是空的（机构名与缩略词除外）。一次站点体验之后，用你自己的密钥。

## ✨ 功能

| 功能 | 做什么 | 不做什么 |
| --- | --- | --- |
| 背景供给 | 写书名、全书分几编、当前落在哪一部分；也可上传原书或背景资料 | 不凭常识改写结构用词 |
| 长文一次导入 | Word / PDF / TXT 整篇识别，规划一次，按段翻译再拼合 | 不必把一本书切成碎片反复上传 |
| 术语（TMXmall 式） | AI 判定何为术语 → 你删改 → 导出 JSON / CSV / TMX | 未审核条目不入库、不强制 |
| 五智能体流水线 | 规划护照 → 术语 → 翻译 → 语体 → 六类风险 | 不猜官方译名，语体不改事实 |
| 译者签发 | 你改完再签，客户看见的是译员的判断 | 智能体不替你交稿 |
| 翻译练习 | 原文、参考译文、自己的译文同桌批改，再决定要不要优化稿 | 优化稿不照抄参考译文 |
| 博客 | 四类各五篇，从译论抽出工坊用得上的方法 | 不代替读原书 |

## 💬 对话示例

```
译员：这部书分三编。我译的是下编，不是全书。
      读者是法律史方向的研究者，语体要克制。

规划：护照已立。
      「编」按你写的背景，指全书的一部分。
      下编 = 本书的第三部分，不写成 Part Two。

术语：候选
      下编  →  Book III
      （普通动词未入库）
      请删改后保存。未审核的不锁定。

翻译：按段起草，已衔接下一段开头。
      「下编」现作 Book III。机构名无术语命中，已标「待核验」。

语体：只动了节奏和称谓。事实锚点和锁定术语未改。

风险：高 — 一处机构名待核验，对照原文第 2 段。
      中 — 情态比原文略硬。

译员：改完。签发。
```

## 🌐 在线演示

| 页面 | 打开方式 |
| --- | --- |
| 工坊演示 | 打开 [demo.html](./demo.html)，或本机运行后访问 http://127.0.0.1:43173/demo.html |
| 三维合译流程 | 打开 [public/heyi-flow.html](./public/heyi-flow.html)，或 http://127.0.0.1:43173/heyi-flow.html |

演示页不需要密钥。完整翻译、练习和术语提取要在本机跑起来之后使用。

## 📁 目录结构

```
co-translate/
├── demo.html                 静态工坊演示
├── GUIDELINE.md              工序、文案、术语、密钥约定
├── package.json
├── data/
│   ├── glossary.json         已审核术语
│   └── rag/chunks.json       按智能体分配的方法摘要
├── public/
│   ├── demo.html             本机 /demo.html
│   ├── heyi-flow.html        三维合译流程
│   └── live-panel/
├── scripts/                  术语表重建等
└── src/
    ├── app/                  页面与 API
    │   ├── workshop/         实战翻译
    │   ├── practice/         翻译练习
    │   ├── glossary/         术语表
    │   ├── guide/            合译流程
    │   └── api/              pipeline / practice / terms …
    ├── components/           工坊、练习、首页、术语管理
    └── lib/                  流水线、背景、长文、术语导出、RAG
```

## 🛠️ 本机运行

需要 Node.js 20+ 和 npm。

```bash
git clone https://github.com/arianotice/co-translate.git
cd co-translate
npm install
```

复制环境文件（Windows PowerShell 用 `Copy-Item`）：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，只填**站点体验额度**。不要把这枚密钥写进仓库。

```
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3
```

国际站用 `https://api.minimax.io/v1`。国内站用 `https://api.minimaxi.com/v1`。

```bash
npm run dev
```

浏览器打开 [http://127.0.0.1:43173](http://127.0.0.1:43173)。

使用者自己的密钥在「设置」填写，只存在你的浏览器。

```bash
npm run build
npm start
```

## 🗺️ 页面

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
| `/demo.html` | 工坊演示 |
| `/heyi-flow.html` | 三维流程 |
| `/terms` | 用户协议 |
| `/privacy` | 隐私政策 |

折叠菜单展开后，每一栏都进入对应落地页。练习只从菜单进入，不放在页脚。

## 🚫 不要提交

- `.env.local` 和任何真实 API Key
- `node_modules/`、`.next/`
- `.tmp-extract/`（本地 PDF 抽取缓存）
- `vendor/live-panel-skill/`（技能源码；运行时副本在 `public/live-panel/`）

`.gitignore` 已覆盖以上路径。提交前用 `git status` 再看一遍。
