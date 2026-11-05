export const CHUNK_CHARS = 3200;
export const PLANNER_DIGEST_CHARS = 7000;

export type TextChunk = {
  index: number;
  total: number;
  text: string;
};

export function splitSourceChunks(source: string, limit = CHUNK_CHARS): TextChunk[] {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= limit) return [{ index: 1, total: 1, text }];

  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const parts: string[] = [];
  let bucket = "";

  const flush = () => {
    if (bucket.trim()) parts.push(bucket.trim());
    bucket = "";
  };

  for (const block of blocks) {
    if (block.length > limit) {
      flush();
      for (const sentence of splitSentences(block, limit)) parts.push(sentence);
      continue;
    }
    if (!bucket) {
      bucket = block;
      continue;
    }
    if (`${bucket}\n\n${block}`.length <= limit) {
      bucket = `${bucket}\n\n${block}`;
    } else {
      flush();
      bucket = block;
    }
  }
  flush();

  return parts.map((item, index) => ({
    index: index + 1,
    total: parts.length,
    text: item,
  }));
}

function splitSentences(block: string, limit: number) {
  const pieces = block.split(/(?<=[。！？；!?;\n])/);
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if ((current + piece).length <= limit) {
      current += piece;
    } else {
      if (current.trim()) out.push(current.trim());
      if (piece.length <= limit) current = piece;
      else {
        for (let i = 0; i < piece.length; i += limit) out.push(piece.slice(i, i + limit));
        current = "";
      }
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function plannerDigest(source: string, limit = PLANNER_DIGEST_CHARS) {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (text.length <= limit) return text;

  const headings = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 40 && /编|章|节|卷|部|篇|Part|Chapter|卷/.test(line))
    .slice(0, 24);

  const head = text.slice(0, Math.floor(limit * 0.62));
  const tail = text.slice(-Math.floor(limit * 0.22));
  const headingBlock = headings.length ? `可见标题：\n${headings.join("\n")}\n\n` : "";
  return `${headingBlock}（全文 ${text.length} 字，以下为规划用节录，翻译时仍须覆盖每一段。）\n\n${head}\n\n……\n\n${tail}`;
}

export function previousTail(text: string, size = 280) {
  const value = text.trim();
  return value.length <= size ? value : value.slice(-size);
}
