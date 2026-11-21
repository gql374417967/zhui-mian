"use client";

import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { scoreDifference, type compareInterviews, type ComparisonRow, type PracticeCompareResponse } from "@/lib/practice-compare";

type Comparison = ReturnType<typeof compareInterviews>;
const colors = { original: "#1d4ed8", current: "#7e22ce" };

function Difference({ original, current }: ComparisonRow) {
  if (original?.score === undefined || current?.score === undefined) {
    return <span className="text-sm text-slate-600">{original && current ? "无可比分数" : "无对应题目"}</span>;
  }
  const delta = scoreDifference(original.score, current.score);
  const color = delta > 0 ? "text-emerald-800" : delta < 0 ? "text-red-800" : "text-slate-600";
  const text = delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : "0 持平";
  return <span data-score-difference={delta} className={`text-sm font-semibold tabular-nums ${color}`}>{text}</span>;
}

export function ReportComparison({ comparison, labels, withSummary = false }: {
  comparison: Comparison;
  labels: [string, string];
  withSummary?: boolean;
}) {
  const { radar, rows, sameQuestions, questions } = comparison;
  const body = withSummary && questions.length ? JSON.stringify({ questions }) : "";
  const [summary, setSummary] = useState<{ body: string; text: string }>();
  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    async function load() {
      let text = "";
      try {
        const response = await fetch("/api/practice-compare", {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
        });
        if (response.ok) {
          const result: PracticeCompareResponse = await response.json();
          if (typeof result.summary === "string") text = result.summary.trim();
        }
      } catch {
        if (!controller.signal.aborted) setSummary({ body, text: "" });
        return;
      }
      if (!controller.signal.aborted) setSummary({ body, text });
    }
    void load();
    return () => controller.abort();
  }, [body]);

  return <section aria-label="两轮对比" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-bold text-slate-950">两轮对比</h2>
    <ul aria-label="对比图例" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-800">
      {labels.map((label, index) => <li key={index} className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
        <span aria-hidden="true" className="mt-1.5 h-2 w-4 shrink-0 rounded-sm" style={{ backgroundColor: index ? colors.current : colors.original }} />{label}
      </li>)}
    </ul>
    {radar.length ? <div className="h-60 min-w-0 sm:h-72" role="img" aria-label={radar.map(({ label, original, current }) => `${label} ${labels[0]} ${original} 分，${labels[1]} ${current} 分`).join("；")}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RadarChart data={radar} outerRadius="58%">
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis dataKey="label" tick={{ fill: "#334155", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 5]} tickCount={6} axisLine={false} tick={false} />
          <Radar name={labels[0]} dataKey="original" stroke={colors.original} strokeWidth={2} fill={colors.original} fillOpacity={0.16} isAnimationActive={false} />
          <Radar name={labels[1]} dataKey="current" stroke={colors.current} strokeWidth={2} strokeDasharray="5 3" fill={colors.current} fillOpacity={0.17} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div> : <p className="text-sm text-slate-600">五维评分数据不足，暂无法叠加雷达图。</p>}
    <div>
      <h3 className="font-semibold text-slate-950">逐题分差</h3>
      <p className="mt-1 text-sm text-slate-600">{sameQuestions ? "按重练题序匹配原轮同题。" : "按题序对比，题干可能不同。"}分差为后轮分数减前轮分数。</p>
      {rows.length ? <ol className="mt-3 space-y-2">
        {rows.map(({ original, current }, index) => <li key={index} className="min-w-0 space-y-2 rounded-lg bg-slate-50 p-3 text-sm [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-semibold">
            <span>{original ? `前轮第 ${original.index} 题` : "前轮无对应题"} → {current ? `后轮第 ${current.index} 题` : "后轮无对应题"}</span>
            <Difference original={original} current={current} />
          </div>
          {sameQuestions && original && current ? <p>{current.question}</p> : <>
            {original && <p>前轮 · {original.question}</p>}
            {current && <p>后轮 · {current.question}</p>}
          </>}
          <p className="tabular-nums text-slate-700">{original?.score === undefined ? "—" : `${original.score} / 10`} → {current?.score === undefined ? "—" : `${current.score} / 10`}</p>
        </li>)}
      </ol> : <p className="mt-2 text-sm text-slate-600">暂无题目可比较。</p>}
    </div>
    {body && (summary?.body === body && summary.text ? <div className="rounded-lg bg-indigo-50 p-3">
      <h3 className="font-semibold text-slate-950">这两轮你改进了什么 / 仍需注意什么</h3>
      <p className="mt-2 text-sm leading-6 [overflow-wrap:anywhere]">{summary.text}</p>
    </div> : <p role="status" data-html2canvas-ignore className="text-sm text-slate-600">{summary?.body === body ? "暂时无法生成对比总结，可查看上方逐题分差。" : "正在生成对比总结…"}</p>)}
  </section>;
}
