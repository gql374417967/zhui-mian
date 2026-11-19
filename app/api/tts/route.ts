export const runtime = "nodejs";

const endpoint = "https://api.siliconflow.cn/v1/audio/speech";
const supportedModel = "FunAudioLLM/CosyVoice2-0.5B";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4096) {
    return Response.json({ error: "请提供 1 至 4096 字符的问题文本。" }, { status: 400 });
  }

  const apiKey = process.env.SF_API_KEY?.trim();
  const model = process.env.TTS_MODEL?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）" || model !== supportedModel) {
    return Response.json({ error: "朗读服务尚未配置。" }, { status: 503 });
  }

  const deadline = AbortSignal.timeout(15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text, voice: `${model}:alex`, response_format: "mp3", stream: false }),
      signal: AbortSignal.any([request.signal, deadline]),
    });
    if (response.ok && /^(audio\/|application\/octet-stream)/i.test(response.headers.get("content-type") ?? "")) {
      const audio = await response.arrayBuffer();
      if (audio.byteLength) {
        return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
      }
    }
    return Response.json({ error: "朗读服务暂时不可用。" }, { status: response.status === 429 ? 429 : response.status === 504 ? 504 : 502 });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: "朗读服务暂时不可用。" }, { status: deadline.aborted ? 504 : 502 });
  }
}
