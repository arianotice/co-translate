"use client";

import { useEffect, useMemo, useState } from "react";
import { BorderBeam } from "border-beam";
import { MetalFx } from "metal-fx";
import { ThinkingOrb } from "thinking-orbs";
import { Copy, Loader2, PenLine, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RISK_CATEGORIES } from "@/lib/agents";
import { loadClientSettings, settingsPayload, useClientSettings } from "@/lib/client-settings";
import { matchDirectionForSource } from "@/lib/direction";
import { DEFAULT_WORKSHOP_DOMAINS } from "@/lib/examples";
import { emptyBriefing, type SourceBriefing } from "@/lib/briefing";
import { uniqueDomains } from "@/lib/glossary";
import { saveLastPair } from "@/lib/last-pair";
import { domainLabel, useLocale } from "@/lib/locale";
import { SOURCE_ACCEPT, readSourceFile } from "@/lib/read-source";
import type {
  AgentId,
  GlossaryTerm,
  PlannerOutput,
  RiskOutput,
  StyleOutput,
  TermMatch,
  TranslateDirection,
  TranslatorDraft,
} from "@/lib/types";

type AgentStatus = "idle" | "running" | "done";

async function readSse(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
) {
  if (!response.body) throw new Error("服务器没有返回数据流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      let event = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}

const ORB_STATE: Record<
  AgentId,
  "working" | "searching" | "composing" | "weaving" | "solving" | "connecting"
> = {
  planner: "searching",
  terminology: "connecting",
  translator: "composing",
  style: "weaving",
  risk: "solving",
};

function AnalysisCard({
  agent,
  running,
  mounted,
  title,
  hint,
  children,
}: {
  agent: AgentId;
  running: boolean;
  mounted: boolean;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const card = (
    <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          {running ? <ThinkingOrb state={ORB_STATE[agent]} size={20} theme="dark" /> : null}
        </div>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
  if (!mounted) return card;
  return (
    <BorderBeam
      active={running}
      size="md"
      colorVariant="mono"
      theme="dark"
      strength={0.35}
      staticColors
    >
      {card}
    </BorderBeam>
  );
}

export function AgentWorkshop({
  initialText = "",
  initialTerms,
}: {
  initialText?: string;
  initialTerms: GlossaryTerm[];
}) {
  const { t } = useLocale();
  const [text, setText] = useState(initialText);
  const [domain, setDomain] = useState("通用");
  const [direction, setDirection] = useState<TranslateDirection>("zh-en");
  const [briefing, setBriefing] = useState<SourceBriefing>(emptyBriefing());
  const [chunkLabel, setChunkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Record<AgentId, AgentStatus>>({
    planner: "idle",
    terminology: "idle",
    translator: "idle",
    style: "idle",
    risk: "idle",
  });
  const [matches, setMatches] = useState<TermMatch[]>([]);
  const [planner, setPlanner] = useState<PlannerOutput | null>(null);
  const [drafts, setDrafts] = useState<TranslatorDraft[]>([]);
  const [style, setStyle] = useState<StyleOutput | null>(null);
  const [risk, setRisk] = useState<RiskOutput | null>(null);
  const [delivery, setDelivery] = useState("");
  const [signed, setSigned] = useState(false);
  const [notice, setNotice] = useState("");
  const [mounted, setMounted] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const clientSettings = useClientSettings();
  const hasOwnKey = Boolean(clientSettings.apiKey.trim());

  useEffect(() => {
    setMounted(true);
    if (initialText.trim()) setDirection(matchDirectionForSource(initialText));
    fetch("/api/settings")
      .then((res) => res.json())
      .then((payload: { trialUsed?: boolean }) => setTrialUsed(Boolean(payload.trialUsed)))
      .catch(() => undefined);
  }, [initialText]);

  const domains = useMemo(() => {
    const extra = uniqueDomains(initialTerms).filter(
      (item) => !DEFAULT_WORKSHOP_DOMAINS.includes(item as (typeof DEFAULT_WORKSHOP_DOMAINS)[number]),
    );
    return ["全部", ...DEFAULT_WORKSHOP_DOMAINS, ...extra];
  }, [initialTerms]);

  function resetBoard() {
    setStatus({
      planner: "idle",
      terminology: "idle",
      translator: "idle",
      style: "idle",
      risk: "idle",
    });
    setMatches([]);
    setPlanner(null);
    setDrafts([]);
    setStyle(null);
    setRisk(null);
    setDelivery("");
    setSigned(false);
    setNotice("");
    setChunkLabel("");
  }

  async function run() {
    if (!text.trim()) {
      toast.error(t.needSource);
      return;
    }
    const settings = loadClientSettings();
    resetBoard();
    setBusy(true);

    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          domain,
          direction,
          comparePrompts: false,
          briefing,
          ...settingsPayload(settings),
          temperature: 0.2,
        }),
      });

      if (!response.ok && !response.headers.get("content-type")?.includes("text/event-stream")) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || t.pipelineFail);
      }

      await readSse(response, (event, data) => {
        if (event === "agent-start") {
          const agent = (data as { agent: AgentId }).agent;
          setStatus((prev) => ({ ...prev, [agent]: "running" }));
        }
        if (event === "agent-done") {
          const payload = data as {
            agent: AgentId;
            matches?: TermMatch[];
            output?: unknown;
            drafts?: TranslatorDraft[];
            primary?: string;
          };
          setStatus((prev) => ({ ...prev, [payload.agent]: "done" }));
          if (payload.agent === "terminology") setMatches(payload.matches ?? []);
          if (payload.agent === "planner") setPlanner(payload.output as PlannerOutput);
          if (payload.agent === "translator") {
            setDrafts(payload.drafts ?? []);
            if (payload.primary) setDelivery(payload.primary);
          }
          if (payload.agent === "style") {
            const next = payload.output as StyleOutput;
            setStyle(next);
            if (next.revised) setDelivery(next.revised);
          }
          if (payload.agent === "risk") setRisk(payload.output as RiskOutput);
        }
        if (event === "chunk") {
          const chunk = data as { index?: number; total?: number };
          if (chunk.index && chunk.total) {
            setChunkLabel(t.chunkProgress.replace("{n}", String(chunk.index)).replace("{total}", String(chunk.total)));
          }
        }
        if (event === "access") {
          if ((data as { mode?: string }).mode === "trial") setTrialUsed(true);
        }
        if (event === "done") {
          const done = data as { translation?: string; message?: string };
          if (done.translation) setDelivery(done.translation);
          if (done.message) setNotice(done.message);
        }
        if (event === "error") {
          throw new Error((data as { message: string }).message);
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.pipelineInterrupted);
    } finally {
      setBusy(false);
    }
  }

  async function copyDelivery() {
    if (!delivery) return;
    await navigator.clipboard.writeText(delivery);
    toast.success(t.copied);
  }

  function applySource(next: string) {
    setText(next);
    setSigned(false);
    if (next.trim()) setDirection(matchDirectionForSource(next));
  }

  return (
    <div className="space-y-10" id="practice">
      <section className="space-y-3">
        <p className="chip">{t.workshopKicker}</p>
        <h1 className="font-heading text-3xl md:text-4xl">{t.workshopTitle}</h1>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
          <CardHeader>
            <CardTitle>{t.source}</CardTitle>
            <CardDescription>{t.fileTypes}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t.direction}</Label>
                {mounted ? (
                  <Select
                    value={direction}
                    onValueChange={(value) => setDirection(value as TranslateDirection)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-en">{t.zhEn}</SelectItem>
                      <SelectItem value="en-zh">{t.enZh}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="border-input text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
                    {direction === "zh-en" ? t.zhEn : t.enZh}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t.domain}</Label>
                {mounted ? (
                  <Select value={domain} onValueChange={setDomain}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t.general} />
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
                  <div className="border-input text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
                    {domain}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 rounded-none border border-[color:var(--line)] bg-[color:var(--fill-ghost)] p-3">
              <div>
                <p className="text-sm font-medium">{t.briefingTitle}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-6">{t.briefingHint}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t.briefingBook}</Label>
                  <input
                    value={briefing.title}
                    onChange={(event) => setBriefing((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder={t.briefingBookPh}
                    className="border-input bg-background h-9 w-full border px-3 text-sm outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.briefingStructure}</Label>
                  <input
                    value={briefing.structure}
                    onChange={(event) => setBriefing((prev) => ({ ...prev, structure: event.target.value }))}
                    placeholder={t.briefingStructurePh}
                    className="border-input bg-background h-9 w-full border px-3 text-sm outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t.briefingNotes}</Label>
                <Textarea
                  value={briefing.notes}
                  onChange={(event) => setBriefing((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder={t.briefingNotesPh}
                  className="min-h-20 bg-background text-sm leading-6"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-6">{t.longTextHint}</p>
            <Textarea
              value={text}
              onChange={(event) => applySource(event.target.value)}
              placeholder=""
              className="min-h-40 bg-background text-base leading-7"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="icon-flow text-muted-foreground inline-flex cursor-pointer items-center gap-2 text-sm">
                <Upload className="size-3.5" />
                {t.upload}
                <input
                  type="file"
                  accept={SOURCE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void readSourceFile(file)
                      .then((content) => applySource(content))
                      .catch((error: unknown) => {
                        toast.error(error instanceof Error && error.message !== "EMPTY" ? error.message : t.fileEmpty);
                      });
                  }}
                />
              </label>
              <div className="inline-flex items-center gap-2">
                {busy ? <ThinkingOrb state="working" size={20} theme="dark" /> : null}
                {chunkLabel ? <span className="text-muted-foreground text-xs">{chunkLabel}</span> : null}
                <Button onClick={() => void run()} disabled={busy || (!hasOwnKey && trialUsed)} size="lg">
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {busy ? t.running : t.run}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t.signTitle}</CardTitle>
                <CardDescription>{t.signHint}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyDelivery()}>
                <Copy />
                {t.copy}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {notice ? (
              <div className="rounded-none border border-dashed border-[color:var(--seal)]/30 bg-[color:var(--seal-soft)] px-3 py-2 text-sm leading-6">
                {notice}
              </div>
            ) : null}
            <Textarea
              value={delivery}
              onChange={(event) => {
                setDelivery(event.target.value);
                setSigned(false);
              }}
              placeholder=""
              className="min-h-40 bg-background text-base leading-7"
            />
            {mounted ? (
              <MetalFx variant="button" preset="silver" theme="dark" strength={0.5} paused={signed || !delivery}>
                <Button
                  variant={signed ? "secondary" : "default"}
                  disabled={!delivery}
                  onClick={() => {
                    setSigned(true);
                    saveLastPair({
                      source: text,
                      translation: delivery,
                      domain: domain === "全部" ? "通用" : domain,
                    });
                    toast.success(t.signedToast);
                  }}
                >
                  <PenLine />
                  {signed ? t.signed : t.sign}
                </Button>
              </MetalFx>
            ) : (
              <Button variant="default" disabled>
                <PenLine />
                {t.sign}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisCard
          agent="planner"
          running={status.planner === "running"}
          mounted={mounted}
          title={t.planner}
          hint={t.plannerHint}
        >
          <div className="space-y-3 text-sm leading-7">
            {planner ? (
              <>
                <p>
                  <span className="text-muted-foreground">{t.register}　</span>
                  {planner.register}
                </p>
                {planner.audience ? (
                  <p>
                    <span className="text-muted-foreground">{t.audience}　</span>
                    {planner.audience}
                  </p>
                ) : null}
                <p>
                  <span className="text-muted-foreground">{t.strategy}　</span>
                  {planner.expected_translation_strategy}
                </p>
                {planner.fact_anchors?.length ? (
                  <ul className="list-disc pl-4">
                    {planner.fact_anchors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {planner.key_terms.map((term) => (
                    <Badge key={term.zh} variant="secondary" className="h-auto py-1">
                      {term.zh}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{t.plannerEmpty}</p>
            )}
          </div>
        </AnalysisCard>

        <AnalysisCard
          agent="terminology"
          running={status.terminology === "running"}
          mounted={mounted}
          title={t.terminology}
          hint={t.terminologyHint}
        >
            {matches.length ? (
              <div className="flex flex-wrap gap-2">
                {matches.map((match) => (
                  <Badge key={`${match.start}-${match.term}`} variant="secondary" className="h-auto gap-2 py-1">
                    <span>{match.matched}</span>
                    <span className="text-[color:var(--seal)]">{match.translation}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t.terminologyEmpty}</p>
            )}
        </AnalysisCard>

        <AnalysisCard
          agent="translator"
          running={status.translator === "running"}
          mounted={mounted}
          title={t.translator}
          hint={t.translatorHint}
        >
          <div className="space-y-3">
            {drafts.length ? (
              drafts.map((draft) => (
                <div key={draft.variant} className="rounded-none bg-muted/50 px-3 py-2 text-sm leading-7">
                  <p className="text-xs tracking-widest text-[color:var(--seal)]">
                    {draft.variant.toUpperCase()} · {draft.label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{draft.output}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">{t.translatorWait}</p>
            )}
          </div>
        </AnalysisCard>

        <AnalysisCard
          agent="style"
          running={status.style === "running"}
          mounted={mounted}
          title={t.style}
          hint={style?.register || t.styleEmpty}
        >
            {style?.issues.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm leading-7">
                {style.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">{t.styleWait}</p>
            )}
        </AnalysisCard>
      </div>

      <AnalysisCard
        agent="risk"
        running={status.risk === "running"}
        mounted={mounted}
        title={t.risk}
        hint={risk?.overall || t.riskHint}
      >
          {risk ? (
            <div className="grid gap-3 md:grid-cols-2">
              {risk.findings.map((finding) => (
                <div key={`${finding.category}-${finding.name}`} className="rounded-none bg-muted/40 px-3 py-3 text-sm leading-6">
                  <p className="font-medium">
                    {finding.category}. {finding.name || RISK_CATEGORIES[finding.category - 1]}
                    <span className="text-muted-foreground ml-2 text-xs">{finding.severity}</span>
                  </p>
                  <p className="mt-1">{finding.evidence}</p>
                  {finding.path ? (
                    <p className="text-muted-foreground mt-1 text-xs">{finding.path}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t.riskWait}</p>
          )}
      </AnalysisCard>
    </div>
  );
}
