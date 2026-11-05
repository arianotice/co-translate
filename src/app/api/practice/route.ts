import { resolveModelAccess } from "@/lib/model-access";
import { readGlossary } from "@/lib/glossary-store";
import { runPracticeCritique } from "@/lib/practice";
import { trialUsedCookie } from "@/lib/trial";

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function missingField(source: string, reference: string, student: string) {
  if (!source) return "请先输入原文";
  if (!reference) return "请先输入参考译文";
  if (!student) return "请先输入自己的译文";
  return "";
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    source?: string;
    reference?: string;
    student?: string;
    domain?: string;
    apiKey?: string;
    provider?: string;
    region?: "cn" | "global" | "custom";
    customBaseUrl?: string;
    model?: string;
    temperature?: number;
    direction?: "zh-en" | "en-zh";
    briefing?: { title?: string; structure?: string; notes?: string };
  };

  const source = body.source?.trim() ?? "";
  const reference = body.reference?.trim() ?? "";
  const student = body.student?.trim() ?? "";
  const missing = missingField(source, reference, student);
  if (missing) {
    return Response.json({ error: missing }, { status: 400 });
  }

  let access;
  try {
    access = resolveModelAccess(request, body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "模型配置无效" },
      { status: 400 },
    );
  }
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const glossary = await readGlossary();
  const encoder = new TextEncoder();
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  };
  if (access.usedHostKey) headers["Set-Cookie"] = trialUsedCookie();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeEvent(event, data)));
      };

      try {
        emit("access", { mode: access.usedHostKey ? "trial" : "user" });
        await runPracticeCritique({
          source,
          reference,
          student,
          domain: body.domain,
          direction: body.direction,
          briefing: {
            title: body.briefing?.title ?? "",
            structure: body.briefing?.structure ?? "",
            notes: body.briefing?.notes ?? "",
          },
          glossary,
          usedHostKey: access.usedHostKey,
          settings: {
            apiKey: access.apiKey,
            baseUrl: access.baseUrl,
            model: access.model,
            temperature: body.temperature ?? 0.2,
          },
          emit,
        });
        controller.close();
      } catch (error) {
        emit("error", {
          message: error instanceof Error ? error.message : "练习批改中断",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
