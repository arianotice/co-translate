"use client";

import { useEffect, useMemo, useState } from "react";
import { BorderBeam } from "border-beam";
import { MetalFx } from "metal-fx";
import { ThinkingOrb } from "thinking-orbs";
import { Copy, Loader2, Sparkles, Upload, WandSparkles } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { domainLabel, useLocale } from "@/lib/locale";
import { SOURCE_ACCEPT, readSourceFile } from "@/lib/read-source";
import type {
  AgentId,
  GlossaryTerm,
  PracticeAppreciation,
  PracticeDiff,
  PracticePlanner,
  PracticeRisk,
  PracticeTerminology,
  TermMatch,
  TranslateDirection,
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
    <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]" suppressHydrationWarning>
      <CardHeader suppressHydrationWarning>
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

function PairBlock({
  sourceLabel,
  referenceLabel,
  studentLabel,
  sourceSpan,
  reference,
  student,
  note,
  merit,
}: {
  sourceLabel: string;
  referenceLabel: string;
  studentLabel: string;
  sourceSpan?: string;
  reference?: string;
  student?: string;
  note?: string;
  merit?: string;
}) {
  return (
    <div className="rounded-none bg-muted/40 px-3 py-3 text-sm leading-6">
      {sourceSpan ? (
        <p>
          <span className="text-muted-foreground">{sourceLabel}　</span>
          {sourceSpan}
        </p>
      ) : null}
      {reference ? (
        <p className="mt-1">
          <span className="text-muted-foreground">{referenceLabel}　</span>
          {reference}
        </p>
      ) : null}
      {student ? (
        <p className="mt-1">
          <span className="text-muted-foreground">{studentLabel}　</span>
          {student}
        </p>
      ) : null}
      {merit ? <p className="mt-2 text-[color:var(--seal)]">{merit}</p> : null}
      {note ? <p className="text-muted-foreground mt-1">{note}</p> : null}
    </div>
  );
}

export function PracticeStudio({ initialTerms }: { initialTerms: GlossaryTerm[] }) {
  const { t } = useLocale();
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");
  const [student, setStudent] = useState("");
  const [domain, setDomain] = useState("通用");
  const [direction, setDirection] = useState<TranslateDirection>("zh-en");
  const [briefing, setBriefing] = useState<SourceBriefing>(emptyBriefing());
  const [busy, setBusy] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [askPolish, setAskPolish] = useState(false);
  const [grant, setGrant] = useState("");
  const [polished, setPolished] = useState("");
  const [status, setStatus] = useState<Record<AgentId, AgentStatus>>({
    planner: "idle",
    terminology: "idle",
    translator: "idle",
    style: "idle",
    risk: "idle",
  });
  const [matches, setMatches] = useState<TermMatch[]>([]);
  const [planner, setPlanner] = useState<PracticePlanner | null>(null);
  const [terminology, setTerminology] = useState<PracticeTerminology | null>(null);
  const [diff, setDiff] = useState<PracticeDiff | null>(null);
  const [appreciation, setAppreciation] = useState<PracticeAppreciation | null>(null);
  const [risk, setRisk] = useState<PracticeRisk | null>(null);
  const [notice, setNotice] = useState("");
  const [mounted, setMounted] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const clientSettings = useClientSettings();
  const hasOwnKey = Boolean(clientSettings.apiKey.trim());
  const ready = Boolean(planner && risk);
  const canRun = !busy && (hasOwnKey || !trialUsed);

  useEffect(() => {
    setMounted(true);
    fetch("/api/settings")
      .then((res) => res.json())
      .then((payload: { trialUsed?: boolean }) => setTrialUsed(Boolean(payload.trialUsed)))
      .catch(() => undefined);
  }, []);

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
    setTerminology(null);
    setDiff(null);
    setAppreciation(null);
    setRisk(null);
    setGrant("");
    setPolished("");
    setNotice("");
  }

  async function readFileInto(setter: (value: string) => void, file: File) {
    try {
      const content = await readSourceFile(file);
      setter(content);
      if (setter === setSource && content.trim()) setDirection(matchDirectionForSource(content));
    } catch (error) {
      toast.error(error instanceof Error && error.message !== "EMPTY" ? error.message : t.fileEmpty);
    }
  }

  async function run() {
    if (!source.trim() || !reference.trim() || !student.trim()) {
      toast.error(t.studioNeedAll);
      return;
    }
    const settings = loadClientSettings();
    resetBoard();
    setBusy(true);

    try {
      const response = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          reference,
          student,
          domain,
          direction,
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
          };
          setStatus((prev) => ({ ...prev, [payload.agent]: "done" }));
          if (payload.agent === "planner") setPlanner(payload.output as PracticePlanner);
          if (payload.agent === "terminology") {
            setTerminology(payload.output as PracticeTerminology);
            setMatches(payload.matches ?? []);
          }
          if (payload.agent === "translator") setDiff(payload.output as PracticeDiff);
          if (payload.agent === "style") setAppreciation(payload.output as PracticeAppreciation);
          if (payload.agent === "risk") setRisk(payload.output as PracticeRisk);
        }
        if (event === "access") {
          if ((data as { mode?: string }).mode === "trial") setTrialUsed(true);
        }
        if (event === "done") {
          const done = data as { grant?: string };
          if (done.grant) setGrant(done.grant);
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

  async function writePolish() {
    setAskPolish(false);
    setPolishing(true);
    try {
      const settings = loadClientSettings();
      const response = await fetch("/api/practice/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          reference,
          student,
          domain,
          direction,
          grant,
          planner,
          appreciation,
          ...settingsPayload(settings),
          temperature: 0.3,
        }),
      });
      const payload = (await response.json()) as { translation?: string; error?: string };
      if (!response.ok || !payload.translation) {
        throw new Error(payload.error || t.studioPolishFail);
      }
      setPolished(payload.translation);
      setNotice(t.studioPolishDone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.studioPolishFail);
    } finally {
      setPolishing(false);
    }
  }

  async function copyPolished() {
    if (!polished) return;
    await navigator.clipboard.writeText(polished);
    toast.success(t.studioCopiedPolish);
  }

  return (
    <div className="space-y-10" id="studio" suppressHydrationWarning>
      <section className="space-y-3" suppressHydrationWarning>
        <p className="chip" suppressHydrationWarning>{t.studioKicker}</p>
        <h1 className="font-heading text-3xl md:text-4xl">{t.studioTitle}</h1>
        <p className="text-muted-foreground max-w-[62ch] text-sm leading-7">{t.studioLead}</p>
      </section>

      <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
        <CardHeader>
          <CardTitle>{t.studioDesk}</CardTitle>
          <CardDescription>{t.fileTypes}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.direction}</Label>
              {mounted ? (
                <Select value={direction} onValueChange={(value) => setDirection(value as TranslateDirection)}>
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
            <p className="text-muted-foreground text-xs leading-6">{t.longTextHint}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {(
              [
                [t.studioSource, source, setSource],
                [t.studioReference, reference, setReference],
                [t.studioStudent, student, setStudent],
              ] as const
            ).map(([label, value, setter]) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{label}</Label>
                  <label className="icon-flow text-muted-foreground inline-flex cursor-pointer items-center gap-1.5 text-xs">
                    <Upload className="size-3.5" />
                    {t.studioUpload}
                    <input
                      type="file"
                      accept={SOURCE_ACCEPT}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void readFileInto(setter, file);
                      }}
                    />
                  </label>
                </div>
                <Textarea
                  value={value}
                  onChange={(event) => {
                    setter(event.target.value);
                    if (setter === setSource && event.target.value.trim()) {
                      setDirection(matchDirectionForSource(event.target.value));
                    }
                  }}
                  className="min-h-40 bg-background text-base leading-7"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {busy || polishing ? <ThinkingOrb state="working" size={20} theme="dark" /> : null}
            <Button onClick={() => void run()} disabled={!canRun} size="lg">
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {busy ? t.running : t.run}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={!ready || busy || polishing}
              onClick={() => setAskPolish(true)}
            >
              {polishing ? <Loader2 className="animate-spin" /> : <WandSparkles />}
              {t.studioPolish}
            </Button>
          </div>
          {!hasOwnKey ? (
            <p className="text-muted-foreground text-xs leading-6">{trialUsed ? t.trialGone : t.trialReady}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisCard
          agent="planner"
          running={status.planner === "running"}
          mounted={mounted}
          title={t.studioPlanner}
          hint={t.studioPlannerHint}
        >
          {planner ? (
            <div className="space-y-3 text-sm leading-7">
              <p>
                <span className="text-muted-foreground">{t.studioFunction}　</span>
                {planner.function}
              </p>
              {planner.audience ? (
                <p>
                  <span className="text-muted-foreground">{t.audience}　</span>
                  {planner.audience}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">{t.studioEquivalence}　</span>
                {planner.equivalence}
              </p>
              {planner.challenges.length ? (
                <ul className="list-disc pl-4">
                  {planner.challenges.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t.plannerEmpty}</p>
          )}
        </AnalysisCard>

        <AnalysisCard
          agent="terminology"
          running={status.terminology === "running"}
          mounted={mounted}
          title={t.studioTerms}
          hint={t.studioTermsHint}
        >
          {terminology?.pairs.length || matches.length ? (
            <div className="space-y-3">
              {matches.length ? (
                <div className="flex flex-wrap gap-2">
                  {matches.map((match) => (
                    <Badge key={`${match.start}-${match.term}`} variant="secondary" className="h-auto gap-2 py-1">
                      <span>{match.matched}</span>
                      <span className="text-[color:var(--seal)]">{match.translation}</span>
                    </Badge>
                  ))}
                </div>
              ) : null}
              {terminology?.pairs.map((pair) => (
                <PairBlock
                  key={`${pair.source}-${pair.student}`}
                  sourceLabel={t.studioSource}
                  referenceLabel={t.studioReference}
                  studentLabel={t.studioStudent}
                  sourceSpan={pair.source}
                  reference={pair.reference}
                  student={pair.student}
                  note={pair.note}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t.studioTermsEmpty}</p>
          )}
        </AnalysisCard>

        <AnalysisCard
          agent="translator"
          running={status.translator === "running"}
          mounted={mounted}
          title={t.studioDiff}
          hint={diff?.overall || t.studioDiffHint}
        >
          {diff?.items.length ? (
            <div className="space-y-3">
              {diff.items.map((item) => (
                <PairBlock
                  key={`${item.sourceSpan}-${item.issue}`}
                  sourceLabel={t.studioSource}
                  referenceLabel={t.studioReference}
                  studentLabel={t.studioStudent}
                  sourceSpan={item.sourceSpan}
                  reference={item.reference}
                  student={item.student}
                  note={item.issue}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t.studioDiffEmpty}</p>
          )}
        </AnalysisCard>

        <AnalysisCard
          agent="style"
          running={status.style === "running"}
          mounted={mounted}
          title={t.studioMerit}
          hint={appreciation?.overall || t.studioMeritHint}
        >
          {appreciation?.contrasts.length ? (
            <div className="space-y-3">
              {appreciation.contrasts.map((item) => (
                <PairBlock
                  key={`${item.reference}-${item.merit}`}
                  sourceLabel={t.studioSource}
                  referenceLabel={t.studioReference}
                  studentLabel={t.studioStudent}
                  sourceSpan={item.sourceSpan}
                  reference={item.reference}
                  student={item.student}
                  merit={item.merit}
                  note={item.lesson}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t.studioMeritEmpty}</p>
          )}
        </AnalysisCard>
      </div>

      <AnalysisCard
        agent="risk"
        running={status.risk === "running"}
        mounted={mounted}
        title={t.studioGrade}
        hint={risk?.overall || t.studioGradeHint}
      >
        {risk ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {risk.findings.map((finding) => (
                <div key={`${finding.category}-${finding.name}`} className="rounded-none bg-muted/40 px-3 py-3 text-sm leading-6">
                  <p className="font-medium">
                    {finding.category}. {finding.name || RISK_CATEGORIES[finding.category - 1]}
                    <span className="text-muted-foreground ml-2 text-xs">{finding.severity}</span>
                  </p>
                  <p className="mt-1">{finding.evidence}</p>
                  {finding.path ? <p className="text-muted-foreground mt-1 text-xs">{finding.path}</p> : null}
                </div>
              ))}
            </div>
            {risk.advice ? <p className="text-sm leading-7">{risk.advice}</p> : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t.riskWait}</p>
        )}
      </AnalysisCard>

      <Card className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{t.studioPolishTitle}</CardTitle>
              <CardDescription>{t.studioPolishHint}</CardDescription>
            </div>
            <Button variant="outline" size="sm" disabled={!polished} onClick={() => void copyPolished()}>
              <Copy />
              {t.copy}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notice ? (
            <div className="mb-3 rounded-none border border-dashed border-[color:var(--seal)]/30 bg-[color:var(--seal-soft)] px-3 py-2 text-sm leading-6">
              {notice}
            </div>
          ) : null}
          {polished ? (
            <p className="whitespace-pre-wrap text-base leading-7">{polished}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t.studioPolishWait}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={askPolish} onOpenChange={setAskPolish}>
        <DialogContent className="rounded-none border-[color:var(--line)] bg-[color:var(--fill-ghost)]">
          <DialogHeader>
            <DialogTitle>{t.studioPolishAsk}</DialogTitle>
            <DialogDescription>{t.studioPolishHint}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAskPolish(false);
                setNotice(t.studioPolishSkip);
              }}
            >
              {t.studioPolishNo}
            </Button>
            {mounted ? (
              <MetalFx variant="button" preset="silver" theme="dark" strength={0.5}>
                <Button onClick={() => void writePolish()}>{t.studioPolishYes}</Button>
              </MetalFx>
            ) : (
              <Button onClick={() => void writePolish()}>{t.studioPolishYes}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
