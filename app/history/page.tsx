"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <h1 className="text-2xl font-bold">历史记录</h1>
    {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
    {records.length ? <ul className="mt-5 space-y-3">
      {records.map(({ interview }) => {
        const { id, input } = interview.session;
        const time = interviewTime(interview);
        const scores = scoredRounds(interview);
        const total = scores.reduce((sum, entry) => sum + entry.score, 0);
        return <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0">
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
