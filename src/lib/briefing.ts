export type SourceBriefing = {
  title: string;
  structure: string;
  notes: string;
};

export function emptyBriefing(): SourceBriefing {
  return { title: "", structure: "", notes: "" };
}

export function formatBriefing(briefing?: SourceBriefing | null) {
  if (!briefing) return "";
  const title = briefing.title.trim();
  const structure = briefing.structure.trim();
  const notes = briefing.notes.trim();
  if (!title && !structure && !notes) return "";

  const lines = ["译者背景供给（必须遵守，优先于常识）："];
  if (title) lines.push(`出处 / 书名：${title}`);
  if (structure) lines.push(`篇章结构：${structure}`);
  if (notes) lines.push(`补充：${notes}`);
  lines.push("结构用词按上述背景翻译，不要凭常识改写。");
  return lines.join("\n");
}

export function briefingQuery(briefing?: SourceBriefing | null) {
  if (!briefing) return "";
  return [briefing.title, briefing.structure, briefing.notes].filter((item) => item.trim()).join(" ");
}
