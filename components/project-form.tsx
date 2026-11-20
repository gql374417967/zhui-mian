"use client";

import { ArrowRight, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { interviewInputKey } from "@/lib/interview-storage";
import { getTrackPreset, maxJdLength, trackPresets } from "@/lib/presets";
import type { JdAnalysis, ProjectInput, ResumeExtraction, ResumeProject } from "@/lib/types";

type JdStatus = { kind: "idle" | "loading" } | { kind: "success"; analysis: JdAnalysis } | { kind: "error"; message: string };
const fieldClassName = "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type Candidate = ResumeProject & { selected: boolean };

export function ProjectForm() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [experience, setExperience] = useState("");
  const [source, setSource] = useState<ProjectInput["source"]>("paste");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [uploadStatus, setUploadStatus] = useState({ message: "", error: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const latestUpload = useRef<AbortController | null>(null);

  const [jdText, setJdText] = useState("");
  const [jdStatus, setJdStatus] = useState<JdStatus>({ kind: "idle" });
  const latestJd = useRef<AbortController | null>(null);

  function editJd(value: string) {
    latestJd.current?.abort();
    latestJd.current = null;
    setJdText(value);
    setJdStatus({ kind: "idle" });
  }

  async function parseJd() {
    const text = jdText.trim();
    if (!text || text.length > maxJdLength) return;

    latestJd.current?.abort();
    const request = new AbortController();
    latestJd.current = request;
    setJdStatus({ kind: "loading" });
    try {
      const response = await fetch("/api/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: text }),
        signal: request.signal,
      });
      const result: JdAnalysis & { error?: string } = await response.json();
      if (latestJd.current !== request) return;
      if (response.ok) {
        setJdStatus({ kind: "success", analysis: result });
      } else {
        setJdStatus({ kind: "error", message: result.error || "JD 解析失败，请重试。" });
      }
    } catch {
      if (latestJd.current === request) setJdStatus({ kind: "error", message: "JD 解析失败，请重试。" });
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    latestUpload.current?.abort();
    const upload = new AbortController();
    latestUpload.current = upload;
    setCandidates([]);
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setUploadStatus({ message: "请选择 PDF 或 DOCX 简历。", error: true });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus({ message: "简历文件不能超过 5 MB。", error: true });
      return;
    }

    setUploadStatus({ message: "正在解析简历…", error: false });
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/parse-resume", { method: "POST", body, signal: upload.signal });
      const result: ResumeExtraction & { error?: string } = await response.json();
      if (latestUpload.current !== upload) return;
      if (!response.ok) throw new Error(result.error || "简历解析失败，请重试。");
      setCandidates(result.projects.map((project) => ({ ...project, selected: true })));
      setUploadStatus({
        message: result.projects.length ? `已提取 ${result.projects.length} 个候选项目。` : "简历中未找到项目经历，请粘贴需要练习的内容。",
        error: false,
      });
    } catch (error) {
      if (latestUpload.current !== upload) return;
      const message = error instanceof Error && !(error instanceof TypeError || error instanceof SyntaxError)
        ? error.message : "简历解析失败，请重试或粘贴项目经历。";
      setUploadStatus({ message, error: true });
    }
  }

  function updateCandidate(index: number, changes: Partial<Candidate>) {
    setCandidates((current) => current.map((project, position) => position === index ? { ...project, ...changes } : project));
  }

  const selected = candidates.filter((project) => project.selected);

  function applyCandidates() {
    if (!selected.length || selected.some((project) => !project.name.trim() || !project.text.trim())) return;
    setExperience(selected.map((project) => `${project.name.trim()}\n${project.text.trim()}`).join("\n\n"));
    setSource("resume");
    setCandidates([]);
    setUploadStatus({ message: "已填入项目经历。", error: false });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!experience.trim()) {
      setNotice("请填写你的项目经历。");
      return;
    }
    const input: ProjectInput = {
      projectText: experience.trim(),
      track: getTrackPreset(String(new FormData(event.currentTarget).get("track"))).name,
      jdAnalysis: jdStatus.kind === "success" ? jdStatus.analysis : undefined,
      source,
    };
    try {
      localStorage.setItem(interviewInputKey, JSON.stringify(input));
    } catch {
      setNotice("浏览器无法保存项目经历，请允许此站点使用本地存储后重试。");
      return;
    }
    router.push("/interview?start=1");
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0 rounded-2xl border border-border p-5 shadow-sm sm:p-6" aria-labelledby="setup-title">
      <h2 id="setup-title" className="text-xl font-bold">准备面试</h2>
      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="block text-sm font-medium">项目经历</span>
          <textarea
            name="experience"
            required
            rows={5}
            value={experience}
            onChange={(event) => {
              setExperience(event.currentTarget.value);
              if (!event.currentTarget.value.trim()) setSource("paste");
              setNotice("");
            }}
            onPaste={() => setSource("paste")}
            className={`${fieldClassName} block resize-y`}
            placeholder="粘贴一段项目经历，写下你做了什么、怎么做，以及最后的结果。"
          />
        </label>
        <label className="block space-y-2">
          <span className="block text-sm font-medium">目标岗位</span>
          <select name="track" defaultValue={trackPresets[0].id} className={`${fieldClassName} min-h-11`}>
            {trackPresets.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="block text-sm font-medium">目标岗位 JD（选填）</span>
            <textarea
              rows={3}
              value={jdText}
              maxLength={maxJdLength}
              onChange={(event) => editJd(event.currentTarget.value)}
              className={`${fieldClassName} block resize-y`}
              placeholder="粘贴招聘描述中的岗位职责和任职要求。"
            />
          </label>
          <Button type="button" variant="outline" onClick={() => void parseJd()}
            disabled={!jdText.trim() || jdStatus.kind === "loading"}>解析 JD</Button>
          <div role="status" className="break-words text-sm leading-6">
            {jdStatus.kind === "loading" && <p>正在解析 JD…</p>}
            {jdStatus.kind === "error" && <p className="text-red-700">{jdStatus.message} 你可以直接用岗位模板开始面试。</p>}
            {jdStatus.kind === "success" && <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium">JD 解析成功</p>
              {jdStatus.analysis.capabilities.length > 0 && <p>岗位能力：{jdStatus.analysis.capabilities.join("、")}</p>}
              {jdStatus.analysis.focusPoints.length > 0 && <p>考察重点：{jdStatus.analysis.focusPoints.join("、")}</p>}
            </div>}
          </div>
        </div>
      </div>
      <p id="resume-upload-note" className="mt-5 text-sm leading-6 text-slate-600">
        支持 PDF、DOCX，单文件最多 5 MB。上传后，简历文字会交给模型提取项目经历。
      </p>
      <input ref={fileInput} type="file" accept=".pdf,.docx" onChange={handleUpload} hidden />
      <div className="mt-2 grid gap-2 min-[390px]:grid-cols-2">
        <Button type="button" variant="outline" aria-describedby="resume-upload-note" onClick={() => fileInput.current?.click()}>
          <Upload size={16} aria-hidden="true" />
          上传简历
        </Button>
        <Button type="submit">
          开始面试
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <div role="status" className="text-sm leading-6">
        {uploadStatus.message && <p className={`mt-3 ${uploadStatus.error ? "text-red-700" : "text-slate-600"}`}>{uploadStatus.message}</p>}
        {notice && <p className="mt-3 text-red-700">{notice}</p>}
      </div>
      {candidates.length > 0 && (
        <section aria-labelledby="resume-projects" className="mt-5 space-y-3">
          <h3 id="resume-projects" className="font-semibold">选择要练习的项目</h3>
          {candidates.map((project, index) => (
            <div key={index} className="min-w-0 space-y-2 rounded-lg border border-border p-3 text-sm">
              <label className="flex items-start gap-2 font-medium">
                <input type="checkbox" checked={project.selected} onChange={(event) => updateCandidate(index, { selected: event.currentTarget.checked })} className="mt-1 shrink-0" />
                <span className="min-w-0 break-words">{project.name.trim() || `项目 ${index + 1}`}</span>
              </label>
              <label className="block space-y-1">
                <span>项目名称</span>
                <input value={project.name} onChange={(event) => updateCandidate(index, { name: event.currentTarget.value })} className={fieldClassName} />
              </label>
              <label className="block space-y-1">
                <span>项目正文</span>
                <textarea rows={4} value={project.text} onChange={(event) => updateCandidate(index, { text: event.currentTarget.value })} className={`${fieldClassName} block resize-y`} />
              </label>
              {project.highlights.length > 0 && <p className="break-words text-slate-600">可追问点：{project.highlights.join("、")}</p>}
            </div>
          ))}
          {experience.trim() && <p className="text-sm text-slate-600">本次填入将替换当前项目经历。</p>}
          <Button type="button" onClick={applyCandidates} disabled={!selected.length || selected.some((project) => !project.name.trim() || !project.text.trim())}>
            {experience.trim() ? "确认替换项目经历" : "填入所选项目"}
          </Button>
        </section>
      )}
    </form>
  );
}
