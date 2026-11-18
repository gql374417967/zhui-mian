import OpenAI from "openai";

export const runtime = "nodejs";

const timeoutMs = 30_000;
const timeoutMessage = "模型响应超时，请重试。";
const upstreamErrorMessage = "模型服务暂时无法完成请求，请稍后重试。";
const encoder = new TextEncoder();

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (role === "system" || role === "user" || role === "assistant") &&
    typeof content === "string" && content.trim().length > 0;
}

function isRetryable(error: unknown) {
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (!(error instanceof OpenAI.APIError) || error.status === undefined) return false;
  return [408, 409, 429].includes(error.status) || error.status >= 500;
}

function sse(event: string, data: object) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）") {
    return Response.json({ error: "缺少 LLM_API_KEY，请在项目根目录的 .env.local 中填写 API Key。" }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    return Response.json({ error: "messages 必须是非空数组，每条消息需包含有效的 role 和非空文本 content。" }, { status: 400 });
  }

  const model = process.env.LLM_MODEL?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  if (!model || !baseURL) {
    return Response.json({ error: "请在服务端配置 LLM_BASE_URL 和 LLM_MODEL。" }, { status: 503 });
  }

  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries: 0 });
  const deadline = AbortSignal.timeout(timeoutMs);
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, deadline, cancellation.signal]);

  const payload = {
    model,
    messages: messages.map(({ role, content }: ChatMessage) => ({ role, content })),
    stream: true as const,
  };

  async function* readText() {
    const response = await client.chat.completions.create(payload, { signal });
    for await (const chunk of response) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
    signal.throwIfAborted();
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = readText();
    try {
      const first = await text.next();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (!first.done) controller.enqueue(sse("delta", { content: first.value }));
        },
        async pull(controller) {
          try {
            const next = await text.next();
            if (signal.aborted) signal.throwIfAborted();
            if (!next.done) {
              controller.enqueue(sse("delta", { content: next.value }));
              return;
            }
            controller.enqueue(sse("done", {}));
          } catch {
            if (cancellation.signal.aborted) return;
            controller.enqueue(sse("error", { error: deadline.aborted ? timeoutMessage : upstreamErrorMessage }));
          }
          controller.close();
        },
        async cancel() {
          cancellation.abort();
          await text.return();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      if (attempt === 0 && !signal.aborted && isRetryable(error)) continue;
      break;
    }
  }

  return deadline.aborted
    ? Response.json({ error: timeoutMessage }, { status: 504 })
    : Response.json({ error: upstreamErrorMessage }, { status: 502 });
}
