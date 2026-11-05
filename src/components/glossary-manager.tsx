"use client";

import { useEffect, useMemo, useState } from "react";
import { Liquid } from "liquid-gooey";
import { Check, Download, Loader2, Pencil, Plus, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { loadClientSettings, settingsPayload } from "@/lib/client-settings";
import { DEFAULT_WORKSHOP_DOMAINS } from "@/lib/examples";
import { downloadText, glossaryToCsv, glossaryToTmx } from "@/lib/glossary-export";
import { uniqueDomains } from "@/lib/glossary";
import { loadLastPair } from "@/lib/last-pair";
import { domainLabel, useLocale } from "@/lib/locale";
import { SOURCE_ACCEPT, readSourceFile } from "@/lib/read-source";
import type { GlossaryTerm } from "@/lib/types";

type Draft = {
  term: string;
  translation: string;
  domain: string;
  note: string;
};

type Candidate = { source: string; translation: string; reason?: string; selected: boolean };

export function GlossaryManager() {
  const { t } = useLocale();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("全部");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);
  const [draft, setDraft] = useState<Draft>({ term: "", translation: "", domain: "通用", note: "" });
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pairSource, setPairSource] = useState("");
  const [pairTranslation, setPairTranslation] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  async function refresh() {
    const response = await fetch("/api/glossary");
    const payload = (await response.json()) as { terms: GlossaryTerm[] };
    setTerms(payload.terms);
  }

  useEffect(() => {
    setMounted(true);
    const pair = loadLastPair();
    if (pair) {
      setPairSource(pair.source);
      setPairTranslation(pair.translation);
      if (pair.domain) setDomain(pair.domain);
    }
    refresh().catch(() => toast.error(t.loadFail));
  }, []);

  const domains = useMemo(() => {
    const extra = uniqueDomains(terms).filter(
      (item) => !DEFAULT_WORKSHOP_DOMAINS.includes(item as (typeof DEFAULT_WORKSHOP_DOMAINS)[number]),
    );
    return ["全部", ...DEFAULT_WORKSHOP_DOMAINS, ...extra];
  }, [terms]);
  const visible = terms.filter((item) => {
    const hay = `${item.term} ${item.translation} ${item.note ?? ""}`.toLowerCase();
    const matchedQuery = hay.includes(query.trim().toLowerCase());
    const matchedDomain = domain === "全部" || item.domain === domain;
    return matchedQuery && matchedDomain;
  });
  const selected = candidates.filter((item) => item.selected);

  function openCreate() {
    setEditing(null);
    setDraft({ term: "", translation: "", domain: domain === "全部" ? "通用" : domain, note: "" });
    setOpen(true);
  }

  function openEdit(term: GlossaryTerm) {
    setEditing(term);
    setDraft({
      term: term.term,
      translation: term.translation,
      domain: term.domain,
      note: term.note ?? "",
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(
        editing ? `/api/glossary/${editing.id}` : "/api/glossary",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || t.saveFail);
      toast.success(editing ? t.updated : t.added);
      setOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.saveFail);
    } finally {
      setSaving(false);
    }
  }

  async function remove(term: GlossaryTerm) {
    if (!window.confirm(`${t.deleteConfirm} ${term.term}`)) return;
    const response = await fetch(`/api/glossary/${term.id}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(payload.error || t.saveFail);
      return;
    }
    toast.success(t.deleted);
    await refresh();
  }

  function parseGlossaryFile(raw: string) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as
        | { term?: string; translation?: string; domain?: string; note?: string }[]
        | { terms?: { term?: string; translation?: string; domain?: string; note?: string }[] };
      const rows = Array.isArray(parsed) ? parsed : parsed.terms;
      if (!Array.isArray(rows)) throw new Error(t.emptyGlossary);
      return rows;
    }
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    return lines.slice(lines[0]?.includes(",") ? 1 : 0).map((line) => {
      const [term, translation, domain, note] = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
      return { term, translation, domain, note };
    });
  }

  async function importGlossaryFile(file: File) {
    setImporting(true);
    try {
      const rows = parseGlossaryFile(await file.text());
      const response = await fetch("/api/glossary/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: rows }),
      });
      const payload = (await response.json()) as { error?: string; added?: number; skipped?: number };
      if (!response.ok) throw new Error(payload.error || t.emptyGlossary);
      toast.success(`${t.imported} ${payload.added ?? 0} · ${t.skipped} ${payload.skipped ?? 0}`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.emptyGlossary);
    } finally {
      setImporting(false);
    }
  }

  async function suggestFromFile(file: File) {
    setSuggesting(true);
    try {
      const text = await readSourceFile(file);
      if (!text.trim()) throw new Error(t.fileIsEmpty);
      const settings = loadClientSettings();
      const response = await fetch("/api/terms/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          domain: domain === "全部" ? "通用" : domain,
          ...settingsPayload(settings),
        }),
      });
      const payload = (await response.json()) as {
        pairs?: { source: string; translation: string; reason?: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || t.detectFail);
      setCandidates((payload.pairs ?? []).map((pair) => ({ ...pair, selected: false })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.detectFail);
    } finally {
      setSuggesting(false);
    }
  }

  async function extractTerms(sourceOnly = false) {
    if (!pairSource.trim() || (!sourceOnly && !pairTranslation.trim())) {
      toast.error(t.extractHint);
      return;
    }
    setExtracting(true);
    try {
      const settings = loadClientSettings();
      const response = await fetch("/api/terms/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pairSource,
          translation: sourceOnly ? "" : pairTranslation,
          domain: domain === "全部" ? "通用" : domain,
          ...settingsPayload(settings),
        }),
      });
      const payload = (await response.json()) as {
        pairs?: { source: string; translation: string; reason?: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || t.extractFail);
      setCandidates((payload.pairs ?? []).map((pair) => ({ ...pair, selected: false })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.extractFail);
    } finally {
      setExtracting(false);
    }
  }

  async function saveCandidates() {
    const chosen = candidates.filter((item) => item.selected && item.source.trim() && item.translation.trim());
    if (!chosen.length) {
      toast.error(t.saveToGlossary);
      return;
    }
    setMerging(true);
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 420));
      for (const candidate of chosen) {
        const response = await fetch("/api/glossary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            term: candidate.source,
            translation: candidate.translation,
            domain: domain === "全部" ? "通用" : domain,
            note: candidate.reason || "",
          }),
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || t.saveFail);
        }
      }
      toast.success(t.saveToGlossary);
      setCandidates([]);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.saveFail);
    } finally {
      setSaving(false);
      setMerging(false);
    }
  }

  function exportJson() {
    downloadText("glossary.json", JSON.stringify(terms, null, 2), "application/json");
  }

  function exportTmx() {
    downloadText("glossary.tmx", glossaryToTmx(terms), "application/xml");
  }

  function exportCsv() {
    downloadText("glossary.csv", glossaryToCsv(terms), "text/csv;charset=utf-8");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="chip">{t.navGlossary}</p>
        <h1 className="font-heading text-3xl md:text-4xl">{t.glossaryTitle}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-7 md:text-base">{t.glossaryHint}</p>
      </section>

      <section className="space-y-4 rounded-none border border-[color:var(--line)] bg-[color:var(--fill-ghost)] p-4">
        <div>
          <h2 className="font-medium">{t.extractTitle}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t.extractHint}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={pairSource}
            onChange={(event) => setPairSource(event.target.value)}
            className="min-h-28 bg-background"
          />
          <Textarea
            value={pairTranslation}
            onChange={(event) => setPairTranslation(event.target.value)}
            className="min-h-28 bg-background"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void extractTerms(false)} disabled={extracting}>
            {extracting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {extracting ? t.extracting : t.extractFromPair}
          </Button>
          <Button variant="outline" onClick={() => void extractTerms(true)} disabled={extracting}>
            {extracting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {extracting ? t.extracting : t.extractSourceOnly}
          </Button>
          <Button onClick={() => void saveCandidates()} disabled={saving || !selected.length}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? t.saving : t.saveToGlossary}
          </Button>
        </div>
        {mounted && selected.length ? (
          <Liquid
            blur={10}
            contrast={18}
            fill="rgba(255,255,255,0.12)"
            className="relative min-h-14"
          >
            {selected.map((candidate, index) => (
              <Liquid.Item
                key={`${candidate.source}-${index}`}
                x={merging ? 72 : index * 36}
                y={0}
                transition="bouncy"
              >
                <span className="inline-flex rounded-full px-3 py-1 text-sm">{candidate.source}</span>
              </Liquid.Item>
            ))}
          </Liquid>
        ) : null}
        {candidates.length
          ? candidates.map((candidate, index) => (
              <div key={index} className="grid gap-3 rounded-none border border-[color:var(--line)] p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                <input
                  type="checkbox"
                  checked={candidate.selected}
                  aria-label={t.saveToGlossary}
                  className="mt-2 accent-[var(--seal)]"
                  onChange={(event) =>
                    setCandidates((items) =>
                      items.map((item, i) => (i === index ? { ...item, selected: event.target.checked } : item)),
                    )
                  }
                />
                <Input
                  value={candidate.source}
                  onChange={(event) =>
                    setCandidates((items) =>
                      items.map((item, i) => (i === index ? { ...item, source: event.target.value } : item)),
                    )
                  }
                />
                <div className="space-y-1">
                  <Input
                    value={candidate.translation}
                    onChange={(event) =>
                      setCandidates((items) =>
                        items.map((item, i) =>
                          i === index ? { ...item, translation: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <p className="text-muted-foreground text-xs">{candidate.reason}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.deleted}
                  onClick={() => setCandidates((items) => items.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))
          : null}
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchTerms}
          className="md:max-w-xs"
        />
        {mounted ? (
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger className="md:w-40">
              <SelectValue placeholder={t.all} />
            </SelectTrigger>
            <SelectContent>
              {domains.map((item) => (
                <SelectItem key={item} value={item}>
                  {domainLabel(t, item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="border-input text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm md:w-40">
            {domain}
          </div>
        )}
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <label className="inline-flex cursor-pointer">
            <span className="icon-flow site-nav__cta inline-flex h-9 items-center gap-2">
              {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {importing ? t.importing : t.uploadGlossary}
            </span>
            <input
              type="file"
              accept=".json,.csv,.txt"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importGlossaryFile(file);
              }}
            />
          </label>
          <label className="inline-flex cursor-pointer">
            <span className="icon-flow border-input bg-background hover:bg-muted inline-flex h-9 items-center gap-2 rounded-none border px-4 text-sm">
              {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {suggesting ? t.detecting : t.uploadDetect}
            </span>
            <input
              type="file"
              accept={SOURCE_ACCEPT}
              className="sr-only"
              disabled={suggesting}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void suggestFromFile(file);
              }}
            />
          </label>
          <Button variant="outline" onClick={exportJson}>
            <Download />
            {t.exportJson}
          </Button>
          <Button variant="outline" onClick={exportTmx}>
            <Download />
            {t.exportTmx}
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download />
            {t.exportCsv}
          </Button>
          <Button onClick={openCreate}>
            <Plus />
            {t.addTerm}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-muted-foreground rounded-none border border-dashed border-[color:var(--line)] bg-[color:var(--fill-ghost)] px-6 py-16 text-center text-sm">
          {t.emptyGlossary}
        </div>
      ) : (
        <div className="overflow-hidden rounded-none bg-[color:var(--fill-ghost)] ring-1 ring-white/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.termCol}</TableHead>
                <TableHead>{t.transCol}</TableHead>
                <TableHead>{t.domainCol}</TableHead>
                <TableHead>{t.noteCol}</TableHead>
                <TableHead className="w-28 text-right">{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="font-medium">{term.term}</TableCell>
                  <TableCell>{term.translation}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{domainLabel(t, term.domain)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {term.note || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(term)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => void remove(term)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t.editTerm : t.newTerm}</DialogTitle>
            <DialogDescription>{t.termUnique}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="term">{t.sourceTerm}</Label>
              <Input
                id="term"
                value={draft.term}
                onChange={(event) => setDraft((prev) => ({ ...prev, term: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="translation">{t.targetTerm}</Label>
              <Input
                id="translation"
                value={draft.translation}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, translation: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">{t.domain}</Label>
              <Input
                id="domain"
                value={draft.domain}
                onChange={(event) => setDraft((prev) => ({ ...prev, domain: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">{t.note}</Label>
              <Textarea
                id="note"
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X />
              {t.cancel}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
