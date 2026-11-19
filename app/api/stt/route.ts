export const runtime = "nodejs";

const maxFileBytes = 4 * 1024 * 1024;
const maxBodyBytes = maxFileBytes + 16 * 1024;
const endpoint = "https://api.siliconflow.cn/v1/audio/transcriptions";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!request.body || !/^multipart\/form-data\s*;/i.test(contentType)) {
    return error("请以表单上传录音文件。", 400);
  }
  if (Number(request.headers.get("content-length")) > maxBodyBytes) {
    return error("录音文件超过 4 MiB，请缩短后重试。", 413);
  }

  let bytes = 0;
  let tooLarge = false;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBodyBytes) {
        tooLarge = true;
        controller.error(new RangeError("录音表单过大"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  const form = await new Response(body, { headers: { "Content-Type": contentType } }).formData().catch(() => null);
  if (tooLarge) return error("录音文件超过 4 MiB，请缩短后重试。", 413);
  const files = form?.getAll("file");
  const file = files?.[0];
  if (files?.length !== 1 || typeof file === "string" || !file?.size) {
    return error("请上传一个非空录音文件。", 400);
  }
  if (file.size > maxFileBytes) return error("录音文件超过 4 MiB，请缩短后重试。", 413);

  const type = file.type.split(";")[0].trim().toLowerCase();
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isWebm = type === "audio/webm" && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  const isMp4 = type === "audio/mp4" && String.fromCharCode(...header.subarray(4)) === "ftyp";
  if (!isWebm && !isMp4) return error("录音格式无效，请上传 WebM 或 MP4 音频。", 415);

  const apiKey = process.env.SF_API_KEY?.trim();
  const model = process.env.ASR_MODEL?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）" || !model) {
    return error("语音转写服务尚未配置，请先使用文字输入。", 503);
  }

  const upload = new FormData();
  upload.set("file", file.slice(0, file.size, type), isWebm ? "recording.webm" : "recording.m4a");
  upload.set("model", model);
  const deadline = AbortSignal.timeout(30_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upload,
      signal,
    });
    if (response.status === 504) return error("语音转写超时，请重试。", 504);
    if (response.status === 429) return error("语音转写请求过多，请稍后重试。", 429);
    if (!response.ok) return error("语音转写服务暂时无法处理录音，请稍后重试。", 502);

    const result = await response.json() as { text?: unknown } | null;
    const text = typeof result?.text === "string" ? result.text.trim() : "";
    if (!text) return error("没有识别到文字，请靠近麦克风再试。", 422);
    return Response.json({ text });
  } catch {
    if (deadline.aborted) return error("语音转写超时，请重试。", 504);
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return error("无法连接语音转写服务，请稍后重试。", 502);
  }
}
