import { emptyRisk, emptyStyle, fallbackPlanner, plannerMessages, riskMessages, styleMessages, translatorMessages } from "./agents";
import { formatBriefing, briefingQuery, type SourceBriefing } from "./briefing";
import { matchDirectionForSource } from "./direction";
import { applyGlossaryDraft, matchTerms } from "./glossary";
import { plannerDigest, previousTail, splitSourceChunks } from "./long-text";
import { completeMinimax, extractJsonObject } from "./minimax";
import { ragBrief } from "./rag";
import type {
  PlannerOutput,
  RiskOutput,
  StyleOutput,
  TermMatch,
  TranslateDirection,
  TranslatorDraft,
} from "./types";

export type PipelineSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
};

export type PipelineEmit = (event: string, data: unknown) => void;

async function runModel(
  settings: PipelineSettings,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens?: number,
) {
  return completeMinimax({
    ...settings,
    messages,
    maxTokens,
  });
}

export async function runAgentPipeline(options: {
  source: string;
  domain?: string;
  comparePrompts: boolean;
  glossary: Parameters<typeof matchTerms>[1];
  settings: PipelineSettings | null;
  direction?: TranslateDirection;
  briefing?: SourceBriefing | null;
  emit: PipelineEmit;
}) {
  const { source, emit } = options;
  const domain = options.domain?.trim() || "通用";
  const direction = options.direction ?? matchDirectionForSource(source);
  const briefing = formatBriefing(options.briefing);
  const ragQuery = [source, briefingQuery(options.briefing)].filter(Boolean).join("\n");
  const matches = matchTerms(source, options.glossary, { direction, domain });
  const locked = applyGlossaryDraft(source, matches);
  const chunks = splitSourceChunks(source);
  const digest = plannerDigest(source);

  if (!options.settings) {
    emit("agent-start", { agent: "planner" });
    emit("agent-done", { agent: "planner", output: fallbackPlanner(source, matches) });
    emit("agent-start", { agent: "terminology" });
    emit("agent-done", { agent: "terminology", matches, locked });
    emit("done", {
      mode: "preview",
      translation: "",
      message: "护照与已审核术语已就绪。接上模型后，Translator / Style / Risk 才会继续跑。",
    });
    return;
  }

  emit("agent-start", { agent: "planner" });
  const planner = await parsePlanner(
    await runModel(
      options.settings,
      plannerMessages(digest, domain, direction, ragBrief("planner", ragQuery, domain), briefing),
      2048,
    ),
    source,
    matches,
  );
  emit("agent-done", { agent: "planner", output: planner });

  emit("agent-start", { agent: "terminology" });
  emit("agent-done", { agent: "terminology", matches, locked });

  const variants: TranslatorDraft["variant"][] = options.comparePrompts ? ["p1", "p2", "p3"] : ["p3"];
  const translatorRag = [ragBrief("translator", ragQuery, domain), ragBrief("terminology", ragQuery, domain)]
    .filter(Boolean)
    .join("\n");

  emit("agent-start", { agent: "translator" });
  const primaryParts: string[] = [];
  let prevTail = "";

  for (const chunk of chunks) {
    emit("chunk", { agent: "translator", index: chunk.index, total: chunk.total });
    const chunkMatches = matchTerms(chunk.text, options.glossary, { direction, domain });
    const cohesion =
      chunks.length > 1
        ? `本节是第 ${chunk.index} / ${chunk.total} 段，只译本节。${prevTail ? `\n${prevTail}` : ""}`
        : "";
    let part = "";
    for (const variant of variants) {
      if (variant !== "p3" && chunks.length > 1) continue;
      part = await runModel(
        options.settings,
        translatorMessages(
          chunk.text,
          chunkMatches.length ? chunkMatches : matches,
          variant,
          planner,
          domain,
          direction,
          translatorRag,
          briefing,
          cohesion,
        ),
        4096,
      );
    }
    const clean = part.trim();
    primaryParts.push(clean);
    prevTail = previousTail(clean);
  }

  const primary = primaryParts.join("\n\n");
  const drafts: TranslatorDraft[] = [
    { variant: "p3", label: "R–T–C–A–C 约束", output: primary },
  ];
  emit("agent-done", { agent: "translator", drafts, primary, chunks: chunks.length });

  emit("agent-start", { agent: "style" });
  const styleParts: string[] = [];
  const styleIssues: string[] = [];
  let styleRegister = "";

  if (chunks.length === 1) {
    const style = await parseStyle(
      await runModel(
        options.settings,
        styleMessages(source, primary, matches, planner, ragBrief("style", ragQuery, domain), briefing),
        4096,
      ),
      primary,
    );
    styleParts.push(style.revised);
    styleIssues.push(...style.issues);
    styleRegister = style.register;
  } else {
    const translatedChunks = splitAligned(primaryParts, chunks.length);
    for (let i = 0; i < chunks.length; i += 1) {
      emit("chunk", { agent: "style", index: i + 1, total: chunks.length });
      const chunkMatches = matchTerms(chunks[i].text, options.glossary, { direction, domain });
      const style = await parseStyle(
        await runModel(
          options.settings,
          styleMessages(
            chunks[i].text,
            translatedChunks[i] || "",
            chunkMatches.length ? chunkMatches : matches,
            planner,
            ragBrief("style", ragQuery, domain),
            briefing,
          ),
          4096,
        ),
        translatedChunks[i] || "",
      );
      styleParts.push(style.revised);
      styleIssues.push(...style.issues.map((issue) => `第 ${i + 1} 段：${issue}`));
      if (!styleRegister) styleRegister = style.register;
    }
  }

  const style: StyleOutput = {
    register: styleRegister || planner.register,
    issues: styleIssues.slice(0, 16),
    revised: styleParts.join("\n\n").trim() || primary,
  };
  emit("agent-done", { agent: "style", output: style });

  const candidate = style.revised.trim() || primary;
  emit("agent-start", { agent: "risk" });
  const riskSource = chunks.length > 1 ? digest : source;
  const riskDraft = chunks.length > 1 ? plannerDigest(candidate) : candidate;
  const risk = await parseRisk(
    await runModel(
      options.settings,
      riskMessages(riskSource, riskDraft, matches, planner, ragBrief("risk", ragQuery, domain), briefing),
      2048,
    ),
  );
  emit("agent-done", { agent: "risk", output: risk });

  emit("done", {
    mode: "live",
    translation: candidate,
    chunks: chunks.length,
  });
}

function splitAligned(parts: string[], expected: number) {
  if (parts.length === expected) return parts;
  return Array.from({ length: expected }, (_, index) => parts[index] || "");
}

function parsePlanner(raw: string, source: string, matches: TermMatch[]): PlannerOutput {
  try {
    const parsed = extractJsonObject<PlannerOutput>(raw);
    return {
      ...fallbackPlanner(source, matches),
      ...parsed,
      fact_anchors: Array.isArray(parsed.fact_anchors) ? parsed.fact_anchors : [],
      audience: parsed.audience || "",
    };
  } catch {
    return fallbackPlanner(source, matches);
  }
}

function parseStyle(raw: string, draft: string): StyleOutput {
  try {
    const parsed = extractJsonObject<StyleOutput>(raw);
    return {
      register: parsed.register || "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      revised: parsed.revised?.trim() || draft,
    };
  } catch {
    return { ...emptyStyle(draft), revised: draft, issues: ["Style Agent 返回无法解析，已保留 Translator 初稿"] };
  }
}

function parseRisk(raw: string): RiskOutput {
  try {
    const parsed = extractJsonObject<RiskOutput>(raw);
    return {
      findings: Array.isArray(parsed.findings) ? parsed.findings : emptyRisk().findings,
      overall: parsed.overall || "",
    };
  } catch {
    return emptyRisk();
  }
}
