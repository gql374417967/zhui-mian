import OpenAI from "openai";
import { maxJdLength } from "@/lib/presets";
import { jdExtractionPrompt } from "@/lib/prompts";
import type { JdAnalysis } from "@/lib/types";

export const runtime = "nodejs";

function readItems(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 8) return;
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return;
    const item = entry.trim();
    if (!item || item.length > 100) return;
    items.push(item);
  }
  return [...new Set(items)];
}

function readAnalysis(content: string): JdAnalysis | undefined {
  const text = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  const result: { capabilities?: unknown; focusPoints?: unknown } | null = JSON.parse(text);
  const capabilities = readItems(result?.capabilities);
  const focusPoints = readItems(result?.focusPoints);
  if (capabilities && focusPoints && (capabilities.length || focusPoints.length)) return { capabilities, focusPoints };
}

export async function POST(request: Request) {
  const body: { jdText?: unknown } | null = await request.json().catch(() => null);
  const jdText = typeof body?.jdText === "string" ? body.jdText.trim() : "";
  if (!jdText || jdText.length > maxJdLength) {
    return Response.json({ error: `请输入岗位 JD，长度为 1～${maxJdLength} 字符。` }, { status: 400 });
  }

  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）" || !baseURL || !model) {
    return Response.json({ error: "服务端尚未配置 JD 解析模型。" }, { status: 503 });
  }

  const timeoutMs = 30_000;
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: jdExtractionPrompt },
        { role: "user", content: jdText },
      ],
    }, { signal: AbortSignal.any([request.signal, deadline]) });
    const result = readAnalysis(completion.choices[0]?.message.content ?? "");
    if (result) return Response.json(result);
  } catch (error) {
    if (deadline.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
      return Response.json({ error: "JD 解析超时，请重试。" }, { status: 504 });
    }
  }
  return Response.json({ error: "未能解析 JD，请检查岗位描述后重试。" }, { status: 502 });
}
