import { resolveModelAccess } from "@/lib/model-access";
import { readGlossary } from "@/lib/glossary-store";
import { runAgentPipeline } from "@/lib/pipeline";
import { trialUsedCookie } from "@/lib/trial";

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    domain?: string;
    comparePrompts?: boolean;
    apiKey?: string;
    provider?: string;
    region?: "cn" | "global" | "custom";
    customBaseUrl?: string;
    model?: string;
    temperature?: number;
    direction?: "zh-en" | "en-zh";
    briefing?: { title?: string; structure?: string; notes?: string };
  };

  const source = body.text?.trim() ?? "";
  if (!source) {
    return Response.json({ error: "请先输入原文" }, { status: 400 });
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
        await runAgentPipeline({
          source,
          domain: body.domain,
          comparePrompts: false,
          direction: body.direction,
          briefing: {
            title: body.briefing?.title ?? "",
            structure: body.briefing?.structure ?? "",
            notes: body.briefing?.notes ?? "",
          },
          glossary,
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
          message: error instanceof Error ? error.message : "流水线中断",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
