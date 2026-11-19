import OpenAI from "openai";
import { projectRewritePrompt } from "@/lib/prompts";
import type { ProjectRewrite } from "@/lib/types";

export const runtime = "nodejs";

const star = { situation: "情境", task: "任务", action: "行动", result: "结果" } as const;
const missingStar = { situation: "项目背景", task: "个人负责的任务", action: "本人执行的具体步骤", result: "项目结果及验证依据" } as const;
const missingDetails = { metrics: "可核实的数字或量化指标", tools: "实际使用的工具或方法细节", outcome: "可核实的结果或验证依据" } as const;

function readRewrite(content: string, source: string[]): ProjectRewrite | undefined {
  const text = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  let result: Record<string, unknown> | null;
  try {
    result = JSON.parse(text);
  } catch {
    return;
  }
  if (!result || !Array.isArray(result.gaps)) return;
  const selectedGaps = result.gaps;
  const used = new Set<number>();
  const sections: string[] = [];
  for (const key of Object.keys(star) as (keyof typeof star)[]) {
    const indexes = result[key];
    if (!Array.isArray(indexes)) return;
    const phrases: string[] = [];
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 1 || index > source.length || used.has(index)) return;
      used.add(index);
      phrases.push(source[index - 1]);
    }
    sections.push(`${star[key]}｜${phrases.length ? phrases.join(" ") : `「待补充：${missingStar[key]}」`}`);
  }
  if (!used.size) return;
  const gaps = Object.entries(missingDetails).filter(([key]) => selectedGaps.includes(key)).map(([, label]) => label);
  if (gaps.length) sections.push(gaps.map((label) => `「待补充：${label}」`).join("\n"));
  return {
    rewrite: sections.join("\n\n"),
    notes: [
      "按情境、任务、行动和结果组织原文，方便在面试时顺着讲。",
      "事实表述来自原文片段，保留个人职责与结果的原始措辞。",
      gaps.length ? `把需要核实的信息标为待补充，包括${gaps.join("、")}。` : "对照原文检查各段所需信息，缺失的段落会标为待补充。",
    ],
  };
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const projectText = (body as { projectText?: unknown } | null)?.projectText;
  if (typeof projectText !== "string" || !projectText.trim()) {
    return Response.json({ error: "请提供项目经历原文。" }, { status: 400 });
  }

  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）" || !baseURL || !model) {
    return Response.json({ error: "服务端尚未配置改写模型。" }, { status: 503 });
  }

  const source = projectText.trim().split(/(?<=[。！？；!?;])\s*|\r?\n/).map((phrase) => phrase.trim()).filter(Boolean);
  const numbered = source.map((text, index) => ({ number: index + 1, text }));
  const timeout = AbortSignal.timeout(30_000);
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    const client = new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 0 });
    let correction = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: projectRewritePrompt + correction },
          { role: "user", content: JSON.stringify(numbered) },
        ],
      }, { signal });
      const result = readRewrite(completion.choices[0]?.message.content ?? "", source);
      if (result) return Response.json(result);
      correction = "\n上一次结果未通过校验。只返回规定的编号数组，编号必须存在且不得重复。";
    }
  } catch {
    if (timeout.aborted) return Response.json({ error: "改写超时，请重试。" }, { status: 504 });
  }
  return Response.json({ error: "暂时无法生成改写，请重试。" }, { status: 502 });
}
