import chunksJson from "../../data/rag/chunks.json";

import type { AgentId } from "./types";

export type RagChunk = {
  id: string;
  agents: AgentId[];
  title: string;
  tags: string[];
  domains: string[];
  source: string;
  text: string;
};

/**
 * RAG 索引在构建时直接打包进函数 bundle（不再用 fs 运行时读取）。
 *
 * 这样 GitHub Pages / Vercel 等静态或 serverless 环境下都可用，
 * 也避免 process.cwd() 在 serverless 运行时指向不存在的数据目录。
 */
const INDEX = chunksJson as unknown as RagChunk[];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2);
}

const PINNED = new Set(["planner-book-bian", "trans-legal-structure", "trans-legal"]);

function shouldPin(source: string, chunk: RagChunk) {
  const hay = tokenize(source);
  if (PINNED.has(chunk.id) && hay.some((token) => ["编", "章", "卷", "部", "篇", "结构"].includes(token))) {
    return true;
  }
  const bag = tokenize(`${chunk.title} ${chunk.tags.join(" ")} ${chunk.text}`);
  return PINNED.has(chunk.id) && hay.some((token) => bag.includes(token));
}

export function retrieveRag(agent: AgentId, source: string, domain = "通用", limit = 3) {
  const hay = tokenize(`${source} ${domain}`);
  const scored = INDEX.filter((chunk) => chunk.agents.includes(agent))
    .map((chunk) => {
      const bag = tokenize(`${chunk.title} ${chunk.tags.join(" ")} ${chunk.domains.join(" ")} ${chunk.text}`);
      let score = chunk.domains.includes(domain) || chunk.domains.includes("通用") ? 2 : 0;
      for (const token of hay) {
        if (bag.includes(token)) score += token.length > 3 ? 2 : 1;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));

  const ranked = (scored.length
    ? scored
    : INDEX.filter((chunk) => chunk.agents.includes(agent)).map((chunk) => ({ chunk, score: 1 }))
  ).map((item) => item.chunk);

  const pins = INDEX.filter((chunk) => chunk.agents.includes(agent) && shouldPin(source, chunk));
  const rest = ranked.filter((chunk) => !pins.some((pin) => pin.id === chunk.id));
  return [...pins, ...rest].slice(0, pins.length ? limit + 1 : limit);
}

export function formatRag(chunksToUse: RagChunk[]) {
  if (!chunksToUse.length) return "";
  return chunksToUse
    .map((chunk) => `- ${chunk.title}：${chunk.text}`)
    .join("\n");
}

export function ragBrief(agent: AgentId, source: string, domain?: string) {
  return formatRag(retrieveRag(agent, source, domain));
}
