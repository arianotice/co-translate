import { NextResponse } from "next/server";

import { completeChat, extractJsonObject } from "@/lib/minimax";
import { resolveUserOrHost } from "@/lib/model-access";

type Pair = { source: string; translation: string; reason?: string; kind?: string };

function appears(hay: string, needle: string) {
  return Boolean(needle) && hay.includes(needle);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      translation?: string;
      domain?: string;
      apiKey?: string;
      provider?: string;
      region?: "cn" | "global" | "custom";
      customBaseUrl?: string;
      model?: string;
    };
    const source = body.source?.trim() ?? "";
    const translation = body.translation?.trim() ?? "";
    if (!source) {
      return NextResponse.json({ error: "需要原文才能判定术语" }, { status: 400 });
    }

    const access = resolveUserOrHost(body);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const pairMode = Boolean(translation);
    const content = await completeChat({
      apiKey: access.apiKey,
      baseUrl: access.baseUrl,
      model: access.model,
      temperature: 0.1,
      maxTokens: 3200,
      messages: [
        {
          role: "system",
          content:
            "你是术语判定助手，工作方式接近翻译记忆库：先判断何为术语，再给出对应译文。术语包括专名、书名、篇章结构单位（编/章/卷/部/篇）、制度词、机构名、缩略词、稳定专业概念。不是术语：普通动词、功能词、整句、一次性修辞、可任意改写的通词。有译文时尽量抽取两侧都能对上的连续片段；没有译文时只从原文判定，translation 写建议译法。不得改写原文片段。只返回 JSON：{\"pairs\":[{\"source\":\"原文连续片段\",\"translation\":\"译文片段或建议译法\",\"reason\":\"为何算术语\",\"kind\":\"name|structure|institution|concept|abbr\"}]}。没有可靠术语时 pairs 为空数组。",
        },
        {
          role: "user",
          content: pairMode
            ? `业务域：${body.domain?.trim() || "通用"}\n原文：\n${source}\n\n译文：\n${translation}`
            : `业务域：${body.domain?.trim() || "通用"}\n只从原文判定术语，译文栏写建议译法，供人工删改。\n原文：\n${source}`,
        },
      ],
    });
    const parsed = extractJsonObject<{ pairs?: Pair[] }>(content);
    const pairs = (Array.isArray(parsed.pairs) ? parsed.pairs : [])
      .filter((pair) => typeof pair?.source === "string" && Boolean(pair.source.trim()))
      .map((pair) => {
        const src = pair.source.trim();
        const tgt = (pair.translation || "").trim();
        const inSource = appears(source, src);
        const inTarget = pairMode && tgt ? appears(translation, tgt) : false;
        const reason = [
          pair.reason?.trim() || "",
          pair.kind ? `类型：${pair.kind}` : "",
          pairMode && tgt && !inTarget ? "建议译法，请人工确认" : "",
          !inSource ? "原文片段待人工核对" : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          source: src,
          translation: tgt,
          reason,
          kind: pair.kind || "",
          selected: false,
        };
      })
      .filter((pair) => pair.source.length <= 40)
      .slice(0, 40);
    return NextResponse.json({ pairs, mode: pairMode ? "pair" : "source" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "术语提取失败" },
      { status: 400 },
    );
  }
}
