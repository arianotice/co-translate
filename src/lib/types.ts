import type { ProviderId } from "./providers";

export type TranslateDirection = "en-zh" | "zh-en";

export type GlossaryTerm = {
  id: string;
  term: string;
  translation: string;
  domain: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type TermMatch = {
  term: string;
  translation: string;
  matched: string;
  start: number;
  end: number;
  domain: string;
};

export type ClientModelSettings = {
  apiKey: string;
  provider: ProviderId;
  customBaseUrl: string;
  model: string;
  temperature: number;
};

export const DEFAULT_DOMAINS = ["通用", "技术", "商务", "法律", "学术", "文学", "时政", "机构", "缩略词"] as const;

export type { SourceBriefing } from "./briefing";

export type AgentId = "planner" | "terminology" | "translator" | "style" | "risk";

export type PlannerOutput = {
  source_text: string;
  register: string;
  audience: string;
  fact_anchors: string[];
  key_terms: { zh: string; en_options: string[]; risk: string }[];
  syntactic_features: string[];
  expected_translation_strategy: string;
  verification_sources: string[];
};

export type TranslatorDraft = {
  variant: "p1" | "p2" | "p3";
  label: string;
  output: string;
};

export type StyleOutput = {
  register: string;
  issues: string[];
  revised: string;
};

export type RiskFinding = {
  category: number;
  name: string;
  severity: "high" | "medium" | "low" | "none";
  evidence: string;
  path: string;
};

export type RiskOutput = {
  findings: RiskFinding[];
  overall: string;
};

export type PracticePlanner = {
  function: string;
  audience: string;
  equivalence: string;
  challenges: string[];
};

export type PracticeTermPair = {
  source: string;
  reference: string;
  student: string;
  note: string;
};

export type PracticeTerminology = {
  pairs: PracticeTermPair[];
};

export type PracticeDiffItem = {
  sourceSpan: string;
  reference: string;
  student: string;
  issue: string;
};

export type PracticeDiff = {
  overall: string;
  items: PracticeDiffItem[];
};

export type PracticeContrast = {
  sourceSpan: string;
  reference: string;
  student: string;
  merit: string;
  lesson: string;
};

export type PracticeAppreciation = {
  overall: string;
  contrasts: PracticeContrast[];
};

export type PracticeRisk = RiskOutput & {
  advice: string;
};

export const MINIMAX_ENDPOINTS = {
  cn: "https://api.minimaxi.com/v1",
  global: "https://api.minimax.io/v1",
} as const;

export const DEFAULT_MODEL = "MiniMax-M3";
