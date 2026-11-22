import { crc32 } from "node:zlib";
import mammoth from "mammoth";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { spaceCjkLatin } from "@/lib/ai-text";
import { resumeExtractionPrompt } from "@/lib/prompts";
import { rateLimit, requestSessionKey } from "@/lib/rate-limit";
import type { ResumeExtraction } from "@/lib/types";

export const runtime = "nodejs";

// Vercel 免费版默认函数超时较短，显式放宽以覆盖 SSE 面试流与大文件解析。
export const maxDuration = 60;

const requestsPerMinute = 10;

const maxFileSize = 5 * 1024 * 1024;
const maxRequestSize = maxFileSize + 64 * 1024;
const maxDocxExpandedSize = 24 * 1024 * 1024;
const maxDocxEntries = 512;
const maxResumeTextLength = 24_000;

const failures = {
  invalidUpload: [400, "请上传一份 PDF 或 DOCX 简历。"],
  fileTooLarge: [413, "简历文件不能超过 5 MB。"],
  requestTooLarge: [413, "上传内容过大，请只上传一份不超过 5 MB 的简历。"],
  invalidFormat: [415, "文件内容与格式不符，请选择有效的 PDF 或 DOCX 简历。"],
  damagedFile: [422, "无法读取简历，文件可能已损坏或加密，请重新导出后上传。"],
  docxTooLarge: [413, "DOCX 解包后内容过大，请删减内容或另存文字版后上传。"],
  textTooLarge: [413, "简历文字过长，请删减内容或粘贴需要练习的项目经历。"],
  noText: [422, "未提取到简历文字，请粘贴文字版项目经历"],
  modelUnavailable: [503, "简历提取服务暂不可用，请稍后重试或粘贴项目经历。"],
  modelFailed: [502, "暂时无法提取项目经历，请重试或粘贴项目经历。"],
  modelTimeout: [504, "提取项目经历超时，请重试或粘贴项目经历。"],
} as const;

type FailureCode = keyof typeof failures;

class ResumeError extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}

function failure(code: FailureCode) {
  const [status, error] = failures[code];
  return Response.json({ code, error }, { status });
}

async function readUpload(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) {
    throw new ResumeError("invalidUpload");
  }

  const reader = request.body.getReader();
  if (Number(request.headers.get("content-length")) > maxRequestSize) {
    void reader.cancel().catch(() => {});
    throw new ResumeError("requestTooLarge");
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestSize) {
        void reader.cancel().catch(() => {});
        throw new ResumeError("requestTooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(Buffer.concat(chunks, size));
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  const parts = Array.from(form.entries());
  const file = form.get("file");
  if (parts.length !== 1 || !(file instanceof File)) throw new ResumeError("invalidUpload");
  if (file.size > maxFileSize) throw new ResumeError("fileTooLarge");
  if (!file.size) throw new ResumeError("damagedFile");
  return file;
}

async function readZipEntry(zip: ZipFile, entry: Entry, limit: number): Promise<Buffer> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream));
  });
  const chunks: Buffer[] = [];
  let size = 0;
  let checksum = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > limit) throw new ResumeError("docxTooLarge");
    if (size > entry.uncompressedSize) throw new ResumeError("damagedFile");
    checksum = crc32(chunk, checksum);
    chunks.push(chunk);
  }
  if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw new ResumeError("damagedFile");
  return Buffer.concat(chunks, size);
}

async function extractDocxText(buffer: Buffer) {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zip) => error ? reject(error) : resolve(zip));
  });
  try {
    if (zip.entryCount > maxDocxEntries) throw new ResumeError("docxTooLarge");
    const entries = new Map<string, Buffer>();
    let remaining = maxDocxExpandedSize;
    for (let index = 0; index < zip.entryCount; index++) {
      const entry = await new Promise<Entry>((resolve, reject) => {
        function onError(error: Error) {
          zip.off("entry", onEntry);
          reject(error);
        }
        function onEntry(entry: Entry) {
          zip.off("error", onError);
          resolve(entry);
        }
        zip.once("error", onError);
        zip.once("entry", onEntry);
        zip.readEntry();
      });
      if (entries.has(entry.fileName)) throw new ResumeError("damagedFile");
      if (entry.uncompressedSize > remaining) throw new ResumeError("docxTooLarge");
      const content = await readZipEntry(zip, entry, remaining);
      entries.set(entry.fileName, content);
      remaining -= content.length;
    }
    const contentTypes = entries.get("[Content_Types].xml")?.toString();
    if (!contentTypes?.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) {
      throw new ResumeError("invalidFormat");
    }
    if (!entries.has("_rels/.rels")) throw new ResumeError("damagedFile");

    // Mammoth 的内存文件接口直接读取已校验的条目，避免再次解包。
    const input = {
      file: {
        exists: (name: string) => entries.has(name),
        async read(name: string, encoding?: string) {
          const content = entries.get(name);
          if (!content) throw new ResumeError("damagedFile");
          return encoding ? new TextDecoder(encoding).decode(content) : content;
        },
      },
    };
    return (await mammoth.extractRawText(input as unknown as Parameters<typeof mammoth.extractRawText>[0])).value;
  } finally {
    zip.close();
  }
}

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".pdf") && buffer.subarray(0, 5).toString() === "%PDF-") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText({ pageJoiner: "" });
      return result.pages.map((page) => page.text).join("\n\n");
    } finally {
      await parser.destroy();
    }
  }
  if (filename.endsWith(".docx") && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return extractDocxText(buffer);
  }
  throw new ResumeError("invalidFormat");
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

function validateProjects(content: string, text: string): ResumeExtraction | undefined {
  let result: unknown;
  try {
    const trimmed = content.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    result = JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    return;
  }
  if (!result || typeof result !== "object" || !("projects" in result) || !Array.isArray(result.projects)) return;

  const source = normalizeWhitespace(text);
  const projects: ResumeExtraction["projects"] = [];
  for (const project of result.projects) {
    if (!project || typeof project !== "object") return;
    const { name, text, highlights } = project;
    if (typeof name !== "string" || !name.trim() || typeof text !== "string" || !Array.isArray(highlights)) return;
    if (!highlights.every((item) => typeof item === "string" && item.trim())) return;

    const excerpt = normalizeWhitespace(text);
    const start = source.indexOf(excerpt);
    if (!excerpt || Array.from(excerpt).length > 300 || start < 0) return;
    projects.push({ name: name.trim(), text: source.slice(start, start + excerpt.length), highlights: highlights.map((item) => item.trim()) });
  }
  return { projects };
}

export async function POST(request: Request) {
  const limit = rateLimit(`resume:${requestSessionKey(request)}`, requestsPerMinute);
  if (!limit.ok) {
    return Response.json({ error: `请求过于频繁，请 ${limit.retryAfter} 秒后再试。` }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfter) },
    });
  }

  let file: File;
  try {
    file = await readUpload(request);
  } catch (error) {
    return failure(error instanceof ResumeError ? error.code : "invalidUpload");
  }

  let text: string;
  try {
    text = (await extractText(file)).trim();
  } catch (error) {
    return failure(error instanceof ResumeError ? error.code : "damagedFile");
  }
  if (!/[\p{L}\p{N}]/u.test(text)) return failure("noText");
  if (text.length > maxResumeTextLength) return failure("textTooLarge");

  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!apiKey || apiKey === "（占位，我稍后自己填）" || !baseURL || !model) return failure("modelUnavailable");

  const timeout = AbortSignal.timeout(30_000);
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    const client = new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: resumeExtractionPrompt },
        { role: "user", content: text },
      ],
    }, { signal });
    const result = validateProjects(completion.choices[0]?.message.content ?? "", text);
    if (result) {
      return Response.json({
        projects: result.projects.map((project) => ({
          name: spaceCjkLatin(project.name),
          text: spaceCjkLatin(project.text),
          highlights: project.highlights.map((item) => spaceCjkLatin(item)),
        })),
      } satisfies ResumeExtraction);
    }
  } catch {
    if (timeout.aborted) return failure("modelTimeout");
  }
  return failure("modelFailed");
}
