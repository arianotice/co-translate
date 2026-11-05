import { RISK_CATEGORIES } from "./agents";
import { briefingQuery, formatBriefing, type SourceBriefing } from "./briefing";
import { sourceLang, targetLang } from "./direction";
import { applyGlossaryDraft, formatMatchedTerms, matchTerms } from "./glossary";
import { plannerDigest } from "./long-text";
import { completeMinimax, extractJsonObject } from "./minimax";
import { hashPracticeTexts, issuePracticeGrant } from "./practice-grant";
import { ragBrief } from "./rag";
import type {
  PracticeAppreciation,
  PracticeContrast,
  PracticeDiff,
  PracticeDiffItem,
  PracticePlanner,
  PracticeRisk,
  PracticeTermPair,
  PracticeTerminology,
  TermMatch,
  TranslateDirection,
} from "./types";

export type PracticeSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
};

export type PracticeEmit = (event: string, data: unknown) => void;

const MAX_CHARS = 48000;

function clip(value: string) {
  const text = value.trim();
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…` : text;
}

function windowForModel(value: string) {
  return value.length > 9000 ? plannerDigest(value, 9000) : value;
}

function ragBlock(rag?: string) {
  if (!rag?.trim()) return "";
  return `\n\n参考知识（只约束批评方法，不得编造源文没有的事实）：\n${rag.trim()}`;
}

function briefingBlock(briefing?: string) {
  if (!briefing?.trim()) return "";
  return `\n\n${briefing.trim()}`;
}

async function runModel(
  settings: PracticeSettings,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 2048,
) {
  return completeMinimax({
    ...settings,
    messages,
    maxTokens,
  });
}

function trio(source: string, reference: string, student: string) {
  return `原文：
${source}

参考译文：
${reference}

译者自己的译文：
${student}`;
}

export function practicePlannerMessages(
  source: string,
  reference: string,
  student: string,
  domain: string,
  direction: TranslateDirection,
  rag?: string,
  briefing?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是翻译练习的规划助手。先立任务护照，不要改写任何译文。只输出一个 JSON 对象。",
    },
    {
      role: "user" as const,
      content: `业务域：${domain}
方向：${sourceLang(direction)} → ${targetLang(direction)}

对照原文、参考译文和译者自己的译文，判断原文功能、目标读者，以及奈达所说的功能动态对等在这篇里具体要求什么。挑战只写练习里必须盯住的点。结构用词按背景供给理解。${briefingBlock(briefing)}${ragBlock(rag)}

输出 JSON：
{
  "function": "原文交际功能",
  "audience": "目标读者",
  "equivalence": "这篇要达到的功能动态对等",
  "challenges": ["练习要点"]
}

${trio(source, reference, student)}`,
    },
  ];
}

export function practiceTerminologyMessages(
  source: string,
  reference: string,
  student: string,
  matches: TermMatch[],
  rag?: string,
  briefing?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是翻译练习的术语对照助手。只比较选词，不重写全文。只输出 JSON。",
    },
    {
      role: "user" as const,
      content: `对照参考译文与译者自己的译文在术语、专名、机构名、结构单位、关键动词上的差别。已锁定术语供核验，不得发明官方译名。${briefingBlock(briefing)}${ragBlock(rag)}

已锁定术语：
${formatMatchedTerms(matches)}

输出 JSON：
{
  "pairs": [
    {"source":"原文用语","reference":"参考译法","student":"译者译法","note":"孰优孰劣、为何"}
  ]
}
pairs 最多 8 条，只写真正有对照价值的条目。

${trio(source, reference, student)}`,
    },
  ];
}

export function practiceDiffMessages(
  source: string,
  reference: string,
  student: string,
  planner: PracticePlanner,
  rag?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是翻译练习的差异拆解助手。只指出两份译文的差别，不另写完整译文。只输出 JSON。",
    },
    {
      role: "user" as const,
      content: `任务护照：
功能：${planner.function}
读者：${planner.audience}
对等：${planner.equivalence}

按原文片段拆开，对比参考译文和译者自己的译文：信息增减、逻辑、情态、句势。${ragBlock(rag)}

输出 JSON：
{
  "overall": "一段总括差别",
  "items": [
    {"sourceSpan":"原文片段","reference":"参考译文对应处","student":"译者对应处","issue":"差别及影响"}
  ]
}
items 最多 8 条。

${trio(source, reference, student)}`,
    },
  ];
}

export function practiceAppreciationMessages(
  source: string,
  reference: string,
  student: string,
  planner: PracticePlanner,
  rag?: string,
) {
  return [
    {
      role: "system" as const,
      content:
        "你是翻译批评与鉴赏助手。只从参考译文里抽出译得好的地方，并一一对照译者自己的译文。不要贬低译者人格。只输出 JSON。",
    },
    {
      role: "user" as const,
      content: `从翻译批评与鉴赏出发：层次清楚（达意、语域、情态、节奏、显隐），先看参考译文为什么站得住，再看译者同一处少了什么或另走了哪条路。护照对等目标：${planner.equivalence}。读者：${planner.audience}。${ragBlock(rag)}

输出 JSON：
{
  "overall": "鉴赏总评",
  "contrasts": [
    {
      "sourceSpan": "原文片段",
      "reference": "参考译文里写得好的一句",
      "student": "译者同一处",
      "merit": "参考译文好在何处（批评术语说人话）",
      "lesson": "译者可怎么吸收，仍保持自己的口气"
    }
  ]
}
contrasts 3 到 8 条，必须一一对照，不要空赞。

${trio(source, reference, student)}`,
    },
  ];
}

export function practiceRiskMessages(
  source: string,
  student: string,
  planner: PracticePlanner,
  matches: TermMatch[],
  rag?: string,
) {
  return [
    {
      role: "system" as const,
      content: "你是翻译练习的风险批改助手。对照原文批译者自己的译文。只输出 JSON。",
    },
    {
      role: "user" as const,
      content: `用六类风险扫描译者自己的译文：1 术语错误 2 意义偏移 3 漏译/增译 4 情态/立场错误 5 语体错误 6 幻觉/来源错误。
功能动态对等目标：${planner.equivalence}
事实与功能：${planner.function}
已锁定术语：
${formatMatchedTerms(matches)}
${ragBlock(rag)}

原文：
${source}

译者自己的译文：
${student}

输出：
{
  "findings": [
    {"category":1,"name":"术语错误","severity":"high|medium|low|none","evidence":"...","path":"改进路径"}
  ],
  "overall": "一句话总评",
  "advice": "下一步怎么练"
}
findings 必须正好覆盖 1 到 6 类。`,
    },
  ];
}

export function practiceOptimizeMessages(
  source: string,
  reference: string,
  student: string,
  planner: PracticePlanner,
  appreciation: PracticeAppreciation | null,
  direction: TranslateDirection,
  rag?: string,
) {
  const merits = appreciation?.contrasts?.length
    ? appreciation.contrasts
        .map((item, index) => `${index + 1}. ${item.merit}｜吸收：${item.lesson}`)
        .join("\n")
    : "（尚无鉴赏条目，按护照自行判断）";

  return [
    {
      role: "system" as const,
      content: [
        "【Role】You are a senior translation coach rewriting one student draft.",
        `【Task】Write ONE ${targetLang(direction)} translation of the ${sourceLang(direction)} source.`,
        "【Constraints】",
        "1. Keep the student's voice: sentence length, hedging, rhythm, and lexical habits.",
        "2. Raise quality toward Nida's functional dynamic equivalence — closest natural equivalent of the source function, not a pastiche of the reference.",
        "3. Absorb techniques named in the merits list. Do not copy the reference wording unless it is the only accurate official name.",
        "4. Do not add facts. Do not drop negation, numbers, names, or commitments.",
        "5. Output the polished translation only. No preface, no notes.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `护照：
功能：${planner.function}
读者：${planner.audience}
对等：${planner.equivalence}

可吸收的参考译文长处：
${merits}
${ragBlock(rag)}

${trio(source, reference, student)}`,
    },
  ];
}

function emptyPlanner(): PracticePlanner {
  return {
    function: "未能解析规划结果。",
    audience: "",
    equivalence: "先保住事实与功能，再谈自然对等。",
    challenges: [],
  };
}

function parsePlanner(raw: string): PracticePlanner {
  try {
    const parsed = extractJsonObject<PracticePlanner>(raw);
    return {
      function: parsed.function || emptyPlanner().function,
      audience: parsed.audience || "",
      equivalence: parsed.equivalence || emptyPlanner().equivalence,
      challenges: Array.isArray(parsed.challenges) ? parsed.challenges.slice(0, 8) : [],
    };
  } catch {
    return emptyPlanner();
  }
}

function parseTerminology(raw: string): PracticeTerminology {
  try {
    const parsed = extractJsonObject<PracticeTerminology>(raw);
    const pairs = (Array.isArray(parsed.pairs) ? parsed.pairs : [])
      .filter((item): item is PracticeTermPair => Boolean(item && item.source))
      .slice(0, 8)
      .map((item) => ({
        source: item.source || "",
        reference: item.reference || "",
        student: item.student || "",
        note: item.note || "",
      }));
    return { pairs };
  } catch {
    return { pairs: [] };
  }
}

function parseDiff(raw: string): PracticeDiff {
  try {
    const parsed = extractJsonObject<PracticeDiff>(raw);
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item): item is PracticeDiffItem => Boolean(item && item.sourceSpan))
      .slice(0, 8)
      .map((item) => ({
        sourceSpan: item.sourceSpan || "",
        reference: item.reference || "",
        student: item.student || "",
        issue: item.issue || "",
      }));
    return { overall: parsed.overall || "", items };
  } catch {
    return { overall: "差异未能解析。", items: [] };
  }
}

function parseAppreciation(raw: string): PracticeAppreciation {
  try {
    const parsed = extractJsonObject<PracticeAppreciation>(raw);
    const contrasts = (Array.isArray(parsed.contrasts) ? parsed.contrasts : [])
      .filter((item): item is PracticeContrast => Boolean(item && (item.reference || item.merit)))
      .slice(0, 8)
      .map((item) => ({
        sourceSpan: item.sourceSpan || "",
        reference: item.reference || "",
        student: item.student || "",
        merit: item.merit || "",
        lesson: item.lesson || "",
      }));
    return { overall: parsed.overall || "", contrasts };
  } catch {
    return { overall: "鉴赏未能解析。", contrasts: [] };
  }
}

function parseRisk(raw: string): PracticeRisk {
  try {
    const parsed = extractJsonObject<PracticeRisk>(raw);
    return {
      findings: Array.isArray(parsed.findings)
        ? parsed.findings
        : RISK_CATEGORIES.map((name, index) => ({
            category: index + 1,
            name,
            severity: "none" as const,
            evidence: "未返回该类",
            path: "",
          })),
      overall: parsed.overall || "",
      advice: parsed.advice || "",
    };
  } catch {
    return {
      findings: RISK_CATEGORIES.map((name, index) => ({
        category: index + 1,
        name,
        severity: "none" as const,
        evidence: "批改未能解析",
        path: "",
      })),
      overall: "风险扫描未能解析。",
      advice: "",
    };
  }
}

export async function runPracticeCritique(options: {
  source: string;
  reference: string;
  student: string;
  domain?: string;
  direction?: TranslateDirection;
  glossary: Parameters<typeof matchTerms>[1];
  settings: PracticeSettings;
  usedHostKey: boolean;
  briefing?: SourceBriefing | null;
  emit: PracticeEmit;
}) {
  const source = clip(options.source);
  const reference = clip(options.reference);
  const student = clip(options.student);
  const viewSource = windowForModel(source);
  const viewReference = windowForModel(reference);
  const viewStudent = windowForModel(student);
  const domain = options.domain?.trim() || "通用";
  const direction = options.direction ?? "zh-en";
  const briefing = formatBriefing(options.briefing);
  const ragQuery = [source, briefingQuery(options.briefing)].filter(Boolean).join("\n");
  const matches = matchTerms(source, options.glossary, { direction, domain });
  const locked = applyGlossaryDraft(source, matches);

  options.emit("agent-start", { agent: "planner" });
  const planner = parsePlanner(
    await runModel(
      options.settings,
      practicePlannerMessages(
        viewSource,
        viewReference,
        viewStudent,
        domain,
        direction,
        ragBrief("planner", ragQuery, domain),
        briefing,
      ),
    ),
  );
  options.emit("agent-done", { agent: "planner", output: planner });

  options.emit("agent-start", { agent: "terminology" });
  const terminology = parseTerminology(
    await runModel(
      options.settings,
      practiceTerminologyMessages(
        viewSource,
        viewReference,
        viewStudent,
        matches,
        ragBrief("terminology", `${ragQuery}\n${reference}\n${student}`, domain),
        briefing,
      ),
    ),
  );
  options.emit("agent-done", { agent: "terminology", output: terminology, matches, locked });

  options.emit("agent-start", { agent: "translator" });
  const diff = parseDiff(
    await runModel(
      options.settings,
      practiceDiffMessages(viewSource, viewReference, viewStudent, planner, ragBrief("translator", ragQuery, domain)),
    ),
  );
  options.emit("agent-done", { agent: "translator", output: diff });

  options.emit("agent-start", { agent: "style" });
  const appreciation = parseAppreciation(
    await runModel(
      options.settings,
      practiceAppreciationMessages(
        viewSource,
        viewReference,
        viewStudent,
        planner,
        ragBrief("style", `${ragQuery}\n${reference}`, domain),
      ),
    ),
  );
  options.emit("agent-done", { agent: "style", output: appreciation });

  options.emit("agent-start", { agent: "risk" });
  const risk = parseRisk(
    await runModel(
      options.settings,
      practiceRiskMessages(viewSource, viewStudent, planner, matches, ragBrief("risk", ragQuery, domain)),
    ),
  );
  options.emit("agent-done", { agent: "risk", output: risk });

  options.emit("done", {
    mode: "live",
    grant: options.usedHostKey ? issuePracticeGrant(hashPracticeTexts(source, reference, student)) : "",
  });
}

export async function runPracticeOptimize(options: {
  source: string;
  reference: string;
  student: string;
  domain?: string;
  direction?: TranslateDirection;
  planner: PracticePlanner | null;
  appreciation: PracticeAppreciation | null;
  settings: PracticeSettings;
}) {
  const source = clip(options.source);
  const reference = clip(options.reference);
  const student = clip(options.student);
  const domain = options.domain?.trim() || "通用";
  const direction = options.direction ?? "zh-en";
  const planner = options.planner ?? emptyPlanner();
  const translation = (
    await runModel(
      options.settings,
      practiceOptimizeMessages(
        source,
        reference,
        student,
        planner,
        options.appreciation,
        direction,
        ragBrief("style", `${source}\n${student}`, domain),
      ),
      3072,
    )
  ).trim();
  return { translation };
}
