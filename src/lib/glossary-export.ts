import type { GlossaryTerm } from "./types";

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function glossaryToTmx(terms: GlossaryTerm[]) {
  const tus = terms
    .map(
      (term) => `    <tu tuid="${xmlEscape(term.id)}">
      <prop type="domain">${xmlEscape(term.domain)}</prop>
      <prop type="note">${xmlEscape(term.note || "")}</prop>
      <tuv xml:lang="zh"><seg>${xmlEscape(term.term)}</seg></tuv>
      <tuv xml:lang="en"><seg>${xmlEscape(term.translation)}</seg></tuv>
    </tu>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header creationtool="Cowork Translation" creationtoolversion="0.1" datatype="PlainText" segtype="phrase" adminlang="zh-CN" srclang="zh" o-tmf="heyi"/>
  <body>
${tus}
  </body>
</tmx>
`;
}

export function glossaryToCsv(terms: GlossaryTerm[]) {
  const rows = ["term,translation,domain,note", ...terms.map((term) => [term.term, term.translation, term.domain, term.note || ""].map(csvEscape).join(","))];
  return `${rows.join("\n")}\n`;
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
