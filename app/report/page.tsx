"use client";

import { Clipboard, Download, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import type { InterviewResult } from "@/lib/engine";
import { practiceQuestions, preparePractice } from "@/lib/interview-practice";
import { hasSubmittedAnswer, readCompletedInterview, readPlan, savePlan, storageEvent } from "@/lib/interview-storage";
import { pullInterviews } from "@/lib/interview-sync";
import type { Feedback, ProjectRewrite, Report, Round } from "@/lib/types";

const card = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6";
const prose = "whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6";
const starLabels = { situation: "情境", task: "任务", action: "行动", result: "结果" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={card}>
    <h2 className="mb-4 text-lg font-bold text-slate-950">{title}</h2>
    {children}
  </section>;
}

function RadarSection({ radar }: { radar: Report["radar"] }) {
  const data = Object.entries(radar).map(([label, score]) => ({ label, score }));
  return <Section title="五维能力雷达">
    <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="h-64 min-w-0 sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={data} outerRadius="61%">
            <PolarGrid stroke="#cbd5e1" />
            <PolarAngleAxis dataKey="label" tick={{ fill: "#334155", fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 5]} tickCount={6} axisLine={false} tick={false} />
            <Radar dataKey="score" stroke="#1d4ed8" strokeWidth={2} fill="#60a5fa" fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-1">
        {data.map(({ label, score }) => <div key={label} className="flex flex-wrap items-center justify-between gap-x-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-slate-700">{label}</dt>
          <dd className="whitespace-nowrap font-semibold tabular-nums text-blue-800">{score} / 5</dd>
        </div>)}
      </dl>
    </div>
  </Section>;
}

function RoundFeedback({ round, result }: { round: Round; result?: InterviewResult<Feedback> }) {
  const feedback = result?.format === "json" ? result.value : round.feedback;
  return <li className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">第 {round.index} 题</h3>
      {feedback && <span className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-bold text-blue-800">{feedback.score} / 10 分</span>}
    </div>
    <p className={`${prose} mt-2 font-semibold`}>{round.question}</p>
    <p className={`${prose} mt-2 border-l-2 border-blue-300 pl-3 text-slate-700`}>原文锚点 · {round.anchor}</p>
    {round.answer.trim() && <p className={`${prose} mt-3 text-slate-700`}><strong>你的回答　</strong>{round.answer}</p>}
    {round.followups.filter(({ answer }) => answer.trim()).map(({ question, answer }, index) => <div key={index} className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className={`${prose} font-semibold`}>追问 · {question}</p>
      <p className={`${prose} mt-1 text-slate-700`}>{answer}</p>
    </div>)}
    {feedback ? <>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.entries(starLabels).map(([key, label]) => <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-3">
          <dt className="text-sm font-bold">{label}</dt>
          <dd className={prose}>{feedback.star[key as keyof Feedback["star"]]}</dd>
        </div>)}
      </dl>
      {feedback.quotes.map(({ said, issue, rewrite }, index) => <div key={index} className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg bg-slate-50 p-3">
          <p className={`${prose} font-semibold`}>原句 · {said}</p>
          <p className={`${prose} mt-1 text-slate-700`}>{issue}</p>
        </div>
        <p className={`${prose} min-w-0 rounded-lg bg-emerald-50 p-3 text-emerald-950`}><strong>改写　</strong>{rewrite}</p>
      </div>)}
      {feedback.missed.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
        {feedback.missed.map((item, index) => <li className={prose} key={index}>{item}</li>)}
      </ul>}
      <p className={`${prose} mt-3 font-semibold text-emerald-900`}>优先改进 · {feedback.oneTip}</p>
    </> : <p className={`${prose} mt-3 text-slate-700`}>{result?.format === "text" ? result.text : "本题暂无评分。"}</p>}
  </li>;
}

function ReportContent({ interview }: { interview: NonNullable<ReturnType<typeof readCompletedInterview>> }) {
  const router = useRouter();
  const content = useRef<HTMLDivElement>(null);
  const { session, feedback, report, practice } = interview;
  const { id, input } = session;
  const answered = session.rounds.filter(hasSubmittedAnswer);
  const weakest = practiceQuestions(interview);
  const [checked, setChecked] = useState(() => readPlan(id));
  useEffect(() => {
    const update = () => setChecked(readPlan(id));
    window.addEventListener(storageEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(storageEvent, update);
      window.removeEventListener("storage", update);
    };
  }, [id]);
  const [planError, setPlanError] = useState("");
  const [rewrite, setRewrite] = useState<ProjectRewrite>();
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteError, setRewriteError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [practiceError, setPracticeError] = useState("");

  function toggleDay(day: number, selected: boolean) {
    const next = selected ? [...checked, day] : checked.filter((entry) => entry !== day);
    setChecked(next);
    try {
      savePlan(id, next);
      setPlanError("");
    } catch {
      setPlanError("浏览器无法保存计划进度，刷新后可能丢失本次变更。");
    }
  }

  async function requestRewrite() {
    setRewriteBusy(true);
    setRewriteError("");
    setCopyStatus("");
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectText: input.projectText }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "改写失败，请重试。");
      setRewrite(result);
    } catch (error) {
      setRewriteError(error instanceof Error && error.message.endsWith("。") ? error.message : "改写失败，请重试。");
    } finally {
      setRewriteBusy(false);
    }
  }

  async function copyRewrite() {
    if (!rewrite) return;
    try {
      await navigator.clipboard.writeText(rewrite.rewrite);
      setCopyStatus("已复制改写稿。");
    } catch {
      setCopyStatus("无法访问剪贴板，请选中改写稿后手动复制。");
    }
  }

  async function exportReport() {
    const target = content.current;
    if (!target) return;
    setExporting(true);
    setExportError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      await document.fonts.ready;
      const canvas = await html2canvas(target, { backgroundColor: "#f8fafc", scale: 2 });
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("PNG 导出失败");
      const url = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = url;
      link.download = `追面复盘-${id}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  async function startPractice() {
    if (!weakest.length || practiceBusy) return;
    setPracticeBusy(true);
    setPracticeError("");
    try {
      const path = await preparePractice(interview);
      if (path) router.push(path);
    } catch {
      setPracticeError("无法保存重练会话，请重试。");
      setPracticeBusy(false);
    }
  }

  return <main className="mx-auto max-w-5xl px-3 pb-8 pt-5 sm:px-6 sm:pt-8">
    <div className="mb-3 flex flex-wrap gap-2">
      <Button variant="outline" disabled={exporting} onClick={() => void exportReport()}>
        <Download size={16} aria-hidden="true" />{exporting ? "正在导出…" : "导出报告长图"}
      </Button>
      {weakest.length > 0 && <Button disabled={practiceBusy} onClick={() => void startPractice()}>
        <RotateCcw size={16} aria-hidden="true" />{weakest.length === 1 ? "重练这题" : "重练最弱两题"}
      </Button>}
      {practice && <Button variant="outline" asChild><Link href={`/report?id=${encodeURIComponent(practice.sourceId)}`}>查看原报告</Link></Button>}
    </div>
    {(exportError || practiceError) && <p role="alert" className="mb-3 text-sm text-red-800">{exportError || practiceError}</p>}
    <div ref={content} data-report-content className="space-y-4 rounded-2xl bg-slate-50 p-3 sm:space-y-5 sm:p-6">
      <header className="rounded-2xl bg-slate-900 p-5 text-white sm:p-7">
        <h1 className="text-2xl font-bold sm:text-3xl">{practice ? "重练复盘报告" : "面试复盘报告"}</h1>
        <p className="mt-2 break-words text-sm text-slate-200">{input.track} · 已回答 {answered.length} 题{practice && ` / 共 ${practice.questions.length} 道重练题`}</p>
      </header>
      {report.format === "json" ? <RadarSection radar={report.value.radar} /> : <Section title="复盘说明"><p className={prose}>{report.text}</p></Section>}
      <Section title="逐题反馈">
        <ol className="space-y-3">{answered.map((round) => <RoundFeedback key={round.index} round={round} result={feedback[round.index - 1]} />)}</ol>
      </Section>
      {report.format === "json" && <>
        <Section title="失分模式">
          <ol className="space-y-2">{report.value.patterns.map((pattern, index) => <li key={index} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-sm font-bold text-blue-900">{index + 1}</span><span className={prose}>{pattern}</span>
          </li>)}</ol>
        </Section>
        <Section title="7 天提升计划">
          <p className="mb-3 text-sm text-slate-700">已完成 {checked.length} / 7 天</p>
          <ol className="space-y-2">{report.value.plan7d.map(({ day, action }) => <li key={day}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-blue-700" checked={checked.includes(day)} onChange={(event) => toggleDay(day, event.target.checked)} />
              <span className={prose}><strong className="mr-2">第 {day} 天</strong>{action}</span>
            </label>
          </li>)}</ol>
          {planError && <p role="alert" data-html2canvas-ignore className="mt-3 text-sm text-red-800">{planError}</p>}
        </Section>
      </>}
      <Section title="AI 改写这段项目经历">
        <p className={`${prose} text-slate-800`}><strong>原文　</strong>{input.projectText}</p>
        <div data-html2canvas-ignore className="mt-4">
          <Button variant="outline" disabled={rewriteBusy} onClick={() => void requestRewrite()}>
            <Sparkles size={16} aria-hidden="true" />{rewriteBusy ? "正在改写…" : rewriteError ? "重试改写" : rewrite ? "重新改写" : "AI 改写这段项目经历"}
          </Button>
          {rewriteError && <p role="alert" className="mt-2 text-sm text-red-800">{rewriteError}</p>}
        </div>
        {rewrite && <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-blue-50 p-3 sm:p-4">
            <h3 className="font-bold text-blue-900">改写稿</h3>
            <p className={`${prose} mt-2`}>{rewrite.rewrite}</p>
          </div>
          <h3 className="font-semibold">修改理由</h3>
          <ul className="list-disc space-y-1 pl-5">{rewrite.notes.map((note, index) => <li key={index} className={prose}>{note}</li>)}</ul>
          <div data-html2canvas-ignore className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void copyRewrite()}><Clipboard size={16} aria-hidden="true" />复制改写稿</Button>
            <p role="status" className="text-sm text-slate-700">{copyStatus}</p>
          </div>
        </div>}
      </Section>
      {report.format === "json" && <Section title="面试前自检清单">
        <ul className="list-disc space-y-2 pl-5">{report.value.checklist.map((item, index) => <li key={index} className={prose}>{item}</li>)}</ul>
      </Section>}
    </div>
  </main>;
}

function ReportLoader() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? undefined;
  const [loaded, setLoaded] = useState<{ id?: string; interview: ReturnType<typeof readCompletedInterview> }>();
  useEffect(() => {
    let active = true;
    const read = () => {
      const interview = readCompletedInterview(id);
      if (active) setLoaded({ id, interview });
      return interview;
    };
    const initial = read();
    window.addEventListener(storageEvent, read);
    window.addEventListener("storage", read);
    const timeout = window.setTimeout(() => { if (active && !read()) router.replace("/"); }, 7000);
    void pullInterviews(id, !id).finally(() => {
      window.clearTimeout(timeout);
      if (active && !read() && !initial) router.replace("/");
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener(storageEvent, read);
      window.removeEventListener("storage", read);
    };
  }, [id, router]);
  return loaded && loaded.id === id && loaded.interview
    ? <ReportContent key={loaded.interview.session.id} interview={loaded.interview} />
    : <p role="status" className="mx-auto max-w-5xl p-6 text-sm text-slate-700">正在读取复盘报告…</p>;
}

export default function ReportPage() {
  return <Suspense fallback={<p role="status" className="mx-auto max-w-5xl p-6 text-sm text-slate-700">正在读取复盘报告…</p>}><ReportLoader /></Suspense>;
}
