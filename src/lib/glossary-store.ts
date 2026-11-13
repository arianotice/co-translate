import { promises as fs } from "fs";
import path from "path";

import type { GlossaryTerm } from "./types";

/**
 * 术语库存储路径。
 *
 * - 本地开发 / 自托管（npm run dev / npm run start）：读写仓库内 data/glossary.json，行为不变。
 * - Vercel serverless：部署文件系统只读，写入只会失败（EROFS）。
 *   检测到 Vercel 运行时，回退到实例可写的 /tmp 目录，保证增删改查不崩。
 *   代价：/tmp 随函数实例生命周期，实例回收后该实例新增术语不会跨请求保留。
 *   需要长期持久化时，改指向 Vercel KV / Blob / 数据库（见 README 部署章节）。
 */
function resolveDataPath(): string {
  if (process.env.VERCEL) {
    return path.join(
      process.env.VERCEL_TMP_DIR || "/tmp",
      "co-translate-data",
      "glossary.json",
    );
  }
  return path.join(process.cwd(), "data", "glossary.json");
}

const DATA_PATH = resolveDataPath();

async function ensureStore() {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, `${JSON.stringify([], null, 2)}\n`, "utf8");
  }
}

export async function readGlossary(): Promise<GlossaryTerm[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw) as GlossaryTerm[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeGlossary(terms: GlossaryTerm[]) {
  await ensureStore();
  await fs.writeFile(DATA_PATH, `${JSON.stringify(terms, null, 2)}\n`, "utf8");
}

export async function createTerm(
  input: Omit<GlossaryTerm, "id" | "createdAt" | "updatedAt">,
) {
  const terms = await readGlossary();
  const now = new Date().toISOString();
  const next: GlossaryTerm = {
    id: crypto.randomUUID(),
    term: input.term.trim(),
    translation: input.translation.trim(),
    domain: input.domain.trim() || "通用",
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (!next.term || !next.translation) {
    throw new Error("术语和译文都不能为空");
  }

  const duplicated = terms.some(
    (item) =>
      item.term.toLowerCase() === next.term.toLowerCase() &&
      item.domain === next.domain,
  );
  if (duplicated) {
    throw new Error(`业务域「${next.domain}」中已存在术语「${next.term}」`);
  }

  terms.push(next);
  await writeGlossary(terms);
  return next;
}

export async function updateTerm(
  id: string,
  patch: Partial<Pick<GlossaryTerm, "term" | "translation" | "domain" | "note">>,
) {
  const terms = await readGlossary();
  const index = terms.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("术语不存在");

  const current = terms[index];
  const next: GlossaryTerm = {
    ...current,
    term: (patch.term ?? current.term).trim(),
    translation: (patch.translation ?? current.translation).trim(),
    domain: (patch.domain ?? current.domain).trim() || "通用",
    note: patch.note === undefined ? current.note : patch.note.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  const duplicated = terms.some(
    (item) =>
      item.id !== id &&
      item.term.toLowerCase() === next.term.toLowerCase() &&
      item.domain === next.domain,
  );
  if (duplicated) {
    throw new Error(`业务域「${next.domain}」中已存在术语「${next.term}」`);
  }

  terms[index] = next;
  await writeGlossary(terms);
  return next;
}

export async function importTerms(
  rows: { term?: string; translation?: string; domain?: string; note?: string }[],
) {
  const terms = await readGlossary();
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  for (const row of rows) {
    const next: GlossaryTerm = {
      id: crypto.randomUUID(),
      term: (row.term ?? "").trim(),
      translation: (row.translation ?? "").trim(),
      domain: (row.domain ?? "通用").trim() || "通用",
      note: row.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    if (!next.term || !next.translation) {
      skipped += 1;
      continue;
    }
    const duplicated = terms.some(
      (item) => item.term.toLowerCase() === next.term.toLowerCase() && item.domain === next.domain,
    );
    if (duplicated) {
      skipped += 1;
      continue;
    }
    terms.push(next);
    added += 1;
  }

  await writeGlossary(terms);
  return { added, skipped, terms };
}

export async function deleteTerm(id: string) {
  const terms = await readGlossary();
  const next = terms.filter((item) => item.id !== id);
  if (next.length === terms.length) throw new Error("术语不存在");
  await writeGlossary(next);
}
