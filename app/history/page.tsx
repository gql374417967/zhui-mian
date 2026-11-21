"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ReportComparison } from "@/components/report-comparison";
import { compareInterviews } from "@/lib/practice-compare";
import { practiceQuestions, preparePractice, scoredRounds } from "@/lib/interview-practice";
import { interviewTime, listCompletedInterviews, storageEvent, type Archive, type CompletedInterview } from "@/lib/interview-storage";
import { pullInterviews } from "@/lib/interview-sync";

const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compared, setCompared] = useState<string[]>([]);
  const selectedRecords = selected.filter((id) => records.some(({ interview }) => interview.session.id === id));
  const first = records.find(({ interview }) => interview.session.id === compared[0])?.interview;
  const second = records.find(({ interview }) => interview.session.id === compared[1])?.interview;
  const comparison = first && second ? compareInterviews(first, second, true) : undefined;

  function toggleSelection(id: string, checked: boolean) {
    setSelected((previous) => {
      const available = previous.filter((entry) => records.some(({ interview }) => interview.session.id === entry));
      return checked ? (available.length < 2 ? [...available, id] : available) : available.filter((entry) => entry !== id);
    });
  }

  function toggleCompareMode() {
    setSelecting(!selecting);
    setSelected([]);
    setCompared([]);
  }

  function recordLabel(interview: CompletedInterview, order: string) {
    const time = Date.parse(interviewTime(interview));
    return `${order} · ${interview.session.input.track}${interview.practice ? " · 同题重练" : ""}${Number.isFinite(time) ? ` · ${dateFormat.format(time)}` : ""}`;
  }

  useEffect(() => {
    let mounted = true;
    const read = () => { if (mounted) setRecords(listCompletedInterviews()); };
    const pull = () => { void pullInterviews().finally(() => { if (mounted) setLoading(false); }); };
    read();
    pull();
    window.addEventListener(storageEvent, read);
    window.addEventListener("storage", read);
    window.addEventListener("online", pull);
    return () => {
      mounted = false;
      window.removeEventListener(storageEvent, read);
      window.removeEventListener("storage", read);
      window.removeEventListener("online", pull);
    };
  }, []);

  async function startPractice(interview: CompletedInterview) {
    setBusy(interview.session.id);
    setError("");
    try {
      const path = await preparePractice(interview);
      if (path) router.push(path);
    } catch {
      setError("无法保存重练会话，请重试。");
    } finally {
      setBusy("");
    }
  }

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">历史记录</h1>
      {records.length >= 2 && <Button variant="outline" onClick={toggleCompareMode}>{selecting ? "退出对比" : "选择记录对比"}</Button>}
    </div>
    {selecting && <div className="mt-4 flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm text-slate-700">已选择 {selectedRecords.length} / 2 条记录</p>
      <Button disabled={selectedRecords.length !== 2} onClick={() => setCompared(selectedRecords)}>对比</Button>
    </div>}
    {comparison && <div className="mt-5">
      <ReportComparison comparison={comparison} labels={[recordLabel(comparison.original, "前轮"), recordLabel(comparison.current, "后轮")]} />
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
    {records.length ? <ul className="mt-5 space-y-3">
      {records.map(({ interview }) => {
        const { id, input } = interview.session;
        const time = interviewTime(interview);
        const scores = scoredRounds(interview);
        const total = scores.reduce((sum, entry) => sum + entry.score, 0);
        const checked = selectedRecords.includes(id);
        return <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
            {selecting && <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-blue-700" checked={checked}
                disabled={!checked && selectedRecords.length === 2} onChange={(event) => toggleSelection(id, event.target.checked)} />
              选择此记录
            </label>}
            <h2 className="break-words font-semibold">{input.track}{interview.practice && " · 同题重练"}</h2>
            <p className="mt-1 text-sm text-slate-600">
              <time dateTime={time}>{Number.isFinite(Date.parse(time)) ? dateFormat.format(new Date(time)) : "时间未知"}</time>
              {" · "}{scores.length ? `总分 ${Number(total.toFixed(2))} / ${10 * scores.length}` : "暂无评分"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/report?id=${encodeURIComponent(id)}`}>查看报告</Link></Button>
            {practiceQuestions(interview).length > 0 && <Button disabled={Boolean(busy)} onClick={() => void startPractice(interview)}>
              {busy === id ? "正在准备…" : "同题重练"}
            </Button>}
          </div>
        </li>;
      })}
    </ul> : <p role="status" className="mt-5 text-sm text-slate-600">{loading ? "正在读取历史记录…" : "还没有已完成的面试。"}</p>}
  </main>;
}
