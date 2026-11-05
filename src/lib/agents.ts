import { sourceLang, targetLang } from "./direction";
import type {
  PlannerOutput,
  RiskOutput,
  StyleOutput,
  TermMatch,
  TranslateDirection,
  TranslatorDraft,
} from "./types";
import { formatMatchedTerms } from "./glossary";

export const RISK_CATEGORIES = [
  "术语错误",
  "意义偏移",
  "漏译 / 增译",
  "情态 / 立场错误",
  "语体错误",
  "幻觉 / 来源错误",
] as const;

function plannerBrief(planner: PlannerOutput | null) {
  if (!planner) return "（尚无翻译护照）";
  return [
    `语域：${planner.register}`,
    `读者：${planner.audience || "未标明"}`,
    `事实锚点：${planner.fact_anchors?.join("；") || "无"}`,
    `策略：${planner.expected_translation_strategy}`,
  ].join("\n");
}

function ragBlock(rag?: string) {
  if (!rag?.trim()) return "";
  return `\n\n参考知识（只约束方法，不得据此添加源文没有的事实）：\n${rag.trim()}`;
}

function briefingBlock(briefing?: string) {
  if (!briefing?.trim()) return "";
  return `\n\n${briefing.trim()}`;
}

export function plannerMessages(
  source: string,
  domain: string,
  direction: TranslateDirection,
  rag?: string,
  briefing?: string,
) {
  return [
    {
      role: "system" as const,
      content:
        "你是翻译规划助手。先出翻译护照，不要直接翻译。只输出一个 JSON 对象，不要 Markdown，不要解释。译者背景供给优先于常识，结构用词按背景理解。",
    },
    {
      role: "user" as const,
      content: `业务域：${domain || "通用"}
方向：${sourceLang(direction)} → ${targetLang(direction)}（只做中英互译）

对源文做翻译前分析。先锁定事实，再谈策略。事实锚点包括日期、数字、专名、机构、职务、引语、否定、篇章结构单位（编/章/卷）与逻辑关系。${briefingBlock(briefing)}${ragBlock(rag)}

输出 JSON：
{
  "source_text": "...",
  "register": "文本类型与语域",
  "audience": "目标读者",
  "fact_anchors": ["必须保住的事实"],
  "key_terms": [{"zh":"...","en_options":["..."],"risk":"high|medium|low — 说明"}],
  "syntactic_features": ["..."],
  "expected_translation_strategy": "...",
  "verification_sources": ["应核验的来源类型"]
}

源文：
${source}`,
    },
  ];
}

export function translatorMessages(
  source: string,
  matches: TermMatch[],
  variant: TranslatorDraft["variant"],
  planner: PlannerOutput | null,
  domain: string,
  direction: TranslateDirection,
  rag?: string,
  briefing?: string,
  cohesion?: string,
) {
  if (variant === "p1") {
    return [
      {
        role: "system" as const,
        content: `你是中英翻译助手。只把源文从${sourceLang(direction)}译成${targetLang(direction)}。只输出译文，不要解释。`,
      },
      {
        role: "user" as const,
        content: `请翻译：\n${source}`,
      },
    ];
  }

  if (variant === "p2") {
    return [
      {
        role: "system" as const,
        content: `你是${domain || "通用"}领域的中英专业译者。只把源文从${sourceLang(direction)}译成${targetLang(direction)}。只输出译文，不要解释。`,
      },
      {
        role: "user" as const,
        content: `按该领域常见发表语体翻译：\n${source}`,
      },
    ];
  }

  return [
    {
      role: "system" as const,
      content: [
        "【Role】You are a senior translator working under glossary lock and a translation passport.",
        `【Task】Produce ONE primary ${targetLang(direction)} translation of the ${sourceLang(direction)} source. Chinese↔English only. Do not explain.`,
        "【Constraints】",
        "1. Mandatory glossary renderings must be used exactly. If a high-risk name has no glossary hit, mark [VERIFY] — do not invent an official name.",
        "2. Preserve fact anchors: dates, numbers, names, titles, quotes, negation, and logical relations.",
        "3. Do not add claims that are not in the source. Do not drop commitments or hedges.",
        "4. Follow the passport register and audience. Structure words follow the briefing.",
        "5. Language polish may not override locked terms or fact anchors.",
        "6. If this is one section of a longer text, translate only this section and keep continuity with the previous tail.",
        "【Audience】Use the passport audience; if missing, keep a register suitable for publication.",
        "【Check】Before finishing, confirm facts and locked terms still stand.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `业务域：${domain || "通用"}
方向：${sourceLang(direction)} → ${targetLang(direction)}

翻译护照：
${plannerBrief(planner)}

术语表（必须遵守）：
${formatMatchedTerms(matches)}
${briefingBlock(briefing)}${ragBlock(rag)}${cohesion ? `\n\n上一节译文末尾（只为衔接，不要重译）：\n${cohesion}` : ""}

【Source text】
${source}`,
    },
  ];
}

export function styleMessages(
  source: string,
  draft: string,
  matches: TermMatch[],
  planner: PlannerOutput | null,
  rag?: string,
  briefing?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是译文语体校审。只修订语域、节奏与情态。不得改写事实锚点和强制术语。只输出 JSON。",
    },
    {
      role: "user" as const,
      content: `翻译护照：
${plannerBrief(planner)}

术语必须保持：
${formatMatchedTerms(matches)}

原文：
${source}

初稿：
${draft}
${briefingBlock(briefing)}${ragBlock(rag)}

输出：
{
  "register": "语域判断",
  "issues": ["具体问题"],
  "revised": "修订后的完整译文"
}`,
    },
  ];
}

export function riskMessages(
  source: string,
  draft: string,
  matches: TermMatch[],
  planner: PlannerOutput | null,
  rag?: string,
  briefing?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是翻译风险扫描助手。只输出 JSON，不要 Markdown。",
    },
    {
      role: "user" as const,
      content: `用六类风险扫描译文：1 术语错误 2 意义偏移 3 漏译/增译 4 情态/立场错误 5 语体错误 6 幻觉/来源错误。
护照事实锚点：
${planner?.fact_anchors?.join("；") || "无"}
已锁定术语：
${formatMatchedTerms(matches)}

原文：
${source}

待审译文：
${draft}
${briefingBlock(briefing)}${ragBlock(rag)}

输出：
{
  "findings": [
    {"category":1,"name":"术语错误","severity":"high|medium|low|none","evidence":"...","path":"改进路径"}
  ],
  "overall": "一句话总评"
}
findings 必须正好覆盖 1 到 6 类。`,
    },
  ];
}

export function fallbackPlanner(source: string, matches: TermMatch[]): PlannerOutput {
  return {
    source_text: source,
    register: "待模型分析。当前仅根据已有术语表做了预拆解。",
    audience: "",
    fact_anchors: [],
    key_terms: matches.map((match) => ({
      zh: match.term,
      en_options: [match.translation],
      risk: "medium — 来自本地术语表，尚未交叉核验",
    })),
    syntactic_features: source.includes("。") ? ["多句"] : ["单句"],
    expected_translation_strategy: "先锁已审核术语与事实锚点，再生成受控译文，最后由译者签发。",
    verification_sources: ["本地术语表", "原文事实锚点"],
  };
}

export function emptyStyle(draft: string): StyleOutput {
  return {
    register: "未跑 Style Agent",
    issues: ["需要 MiniMax Key 才能做语体校审"],
    revised: draft,
  };
}

export function emptyRisk(): RiskOutput {
  return {
    findings: RISK_CATEGORIES.map((name, index) => ({
      category: index + 1,
      name,
      severity: "none" as const,
      evidence: "预览模式未扫描",
      path: "接上 MiniMax 后由 Risk Agent 扫描",
    })),
    overall: "已有术语已锁定，完整风险扫描需要 MiniMax。",
  };
}
