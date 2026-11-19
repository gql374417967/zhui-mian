"use client";

import { Bot, ClipboardCheck, Mic, Send, Square } from "lucide-react";
import { useVoiceInput } from "@/lib/use-voice-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { createInterviewEngine, type InterviewResult, type InterviewState } from "@/lib/engine";
import { interviewInputKey, interviewSessionKey, readInterviewStorage, type SavedInterview } from "@/lib/interview-storage";
import type { Feedback, ProjectInput } from "@/lib/types";
import { cn } from "@/lib/utils";

const engine = createInterviewEngine();
const demoInput: ProjectInput = {
  projectText: "参与开发校园二手交易小程序，负责后端接口开发，使用 Redis 优化了查询性能，用户反馈良好。",
  track: "后端开发",
  source: "demo",
};

function QuestionText({ text, animate }: { text: string; animate: boolean }) {
  const [visible, setVisible] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(text.length);
      return;
    }
    const step = Math.max(1, Math.ceil(text.length / 36));
    let length = 0;
    const timer = window.setInterval(() => {
      length += step;
      setVisible(length);
      if (length >= text.length) window.clearInterval(timer);
    }, 22);
    return () => window.clearInterval(timer);
  }, [animate, text]);

  return (
    <p className="mt-2 whitespace-pre-wrap break-words leading-7">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="relative block">
        <span className="invisible">{text}</span>
        <span className="absolute inset-0">{text.slice(0, visible)}</span>
      </span>
    </p>
  );
}

function QuestionCard({ question, anchor, followup, animate }: {
  question: string;
  anchor?: string;
  followup?: number;
  animate: boolean;
}) {
  return (
    <article className={cn("min-w-0 rounded-xl border p-4 sm:p-5", followup
      ? "ml-3 border-violet-200 border-l-4 bg-violet-50 sm:ml-7"
      : "border-blue-200 bg-blue-50")}>
      <h3 className={cn("flex items-center gap-2 text-sm font-semibold", followup ? "text-violet-800" : "text-blue-800")}>
        <Bot size={17} aria-hidden="true" />
        {followup ? `追问 ${followup}` : "面试官提问"}
      </h3>
      {anchor && (
        <blockquote className="mt-3 break-words rounded-md border-l-2 border-blue-500 bg-white px-3 py-2 text-sm leading-6 text-blue-950">
          面试官抓住了这句：<mark className="bg-blue-100 text-inherit">{anchor}</mark>
        </blockquote>
      )}
      <QuestionText text={question} animate={animate} />
    </article>
  );
}

function AnswerCard({ answer }: { answer: string }) {
  return (
    <article className="ml-auto w-fit max-w-[94%] rounded-xl bg-slate-100 px-4 py-3 sm:max-w-[85%]">
      <h3 className="text-xs font-semibold text-slate-600">你的回答</h3>
      <p className="mt-1 whitespace-pre-wrap break-words leading-7">{answer}</p>
    </article>
  );
}

function FeedbackCard({ result, index }: { result: InterviewResult<Feedback>; index: number }) {
  const feedback = result.format === "json" ? result.value : undefined;
  return (
    <article className="min-w-0 rounded-xl border border-emerald-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <ClipboardCheck size={17} aria-hidden="true" /> 第 {index} 题反馈
        </h3>
        {feedback && <p className="rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-900">{feedback.score} / 10 分</p>}
      </div>
      {feedback ? (
        <>
          <ul className="mt-4 space-y-3">
            {feedback.quotes.map(({ said, issue, rewrite }, quoteIndex) => (
              <li key={quoteIndex} className="grid gap-2 text-sm leading-6 sm:grid-cols-2">
                <div className="min-w-0 break-words rounded-lg bg-slate-50 px-3 py-2.5">
                  <h4 className="font-semibold">原句</h4>
                  <p className="whitespace-pre-wrap">{said}</p>
                  <p className="mt-1 text-slate-600">{issue}</p>
                </div>
                <div className="min-w-0 break-words rounded-lg bg-emerald-50 px-3 py-2.5">
                  <h4 className="font-semibold text-emerald-900">改写</h4>
                  <p className="whitespace-pre-wrap">{rewrite}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 break-words border-l-2 border-emerald-600 pl-3 text-sm leading-6 text-emerald-950">
            <strong className="mr-2">优先改这一点</strong>{feedback.oneTip}
          </p>
        </>
      ) : result.format === "text" && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{result.text}</p>}
    </article>
  );
}

function isProjectInput(value: ProjectInput | undefined): value is ProjectInput {
  return typeof value?.projectText === "string" && Boolean(value.projectText.trim()) && typeof value.track === "string";
}

export default function InterviewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<SavedInterview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [animate, setAnimate] = useState(false);
  const mounted = useRef(false);
  const initialized = useRef(false);
  const inFlight = useRef(false);
  const latest = useRef<HTMLDivElement>(null);
  const latestSaved = useRef<SavedInterview | null>(null);
  const voice = useVoiceInput((text) => {
    const snapshot = latestSaved.current;
    if (!snapshot || !mounted.current || inFlight.current) return;
    const separator = snapshot.draft && !snapshot.draft.endsWith("\n") ? "\n" : "";
    save({ ...snapshot, draft: snapshot.draft + separator + text });
  });

  function save(next: SavedInterview) {
    latestSaved.current = next;
    setSaved(next);
    try {
      localStorage.setItem(interviewSessionKey, JSON.stringify(next));
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }

  async function run(label: string, operation: () => Promise<InterviewState>, snapshot: SavedInterview, openReport = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    voice.cancel();
    setBusy(label);
    setError("");
    try {
      const state = await operation();
      if (!mounted.current) return;
      setAnimate(true);
      const persisted = save({ ...snapshot, state, draft: "" });
      if (openReport && persisted) router.push("/report");
    } catch {
      if (mounted.current) setError("操作未完成，请重试。已提交的进度和当前草稿仍在此页。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  }

  function start(snapshot: SavedInterview) {
    void run("正在准备第一道题…", () => engine.start(snapshot.input, {
      id: snapshot.input.track,
      name: snapshot.input.track,
      capabilities: ["个人贡献", "决策依据", "结果验证", "复盘反思"],
      seedQuestions: [],
    }), snapshot);
  }

  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.search);
      const input = params.has("demo") ? demoInput
        : params.has("start") ? readInterviewStorage<ProjectInput>(interviewInputKey) : undefined;
      const stored = readInterviewStorage<SavedInterview>(interviewSessionKey);
      setReady(true);
      if (isProjectInput(input)) {
        const snapshot = { input, state: null, draft: "" };
        if (save(snapshot)) window.history.replaceState(window.history.state, "", "/interview");
        start(snapshot);
      } else if (stored && isProjectInput(stored.input) && typeof stored.draft === "string" &&
        (stored.state === null || (stored.state?.session?.rounds?.length && Array.isArray(stored.state.feedback)))) {
        latestSaved.current = stored;
        setSaved(stored);
        if (!stored.state) start(stored);
      }
    }
    return () => { mounted.current = false; };
    // 首次挂载时读取浏览器本地会话，避免每次重新渲染都启动面试。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = saved?.state;
  useEffect(() => {
    if (state) latest.current?.scrollIntoView({ block: "nearest" });
  }, [state, busy]);

  const activeRound = state?.session.rounds.at(-1);
  const active = state && state.phase !== "completed" ? state : null;

  function sendAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const snapshot = latestSaved.current;
    if (!active || !snapshot?.draft.trim() || inFlight.current) return;
    void run("面试官正在处理回答…", () => engine.submitAnswer(active, snapshot.draft), snapshot);
  }

  const recording = voice.phase === "recording";
  const voiceStatus = voice.phase === "permission" ? "等待麦克风授权…"
    : recording ? "正在录音" : voice.phase === "transcribing" ? "正在转写…" : voice.notice;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-5 sm:px-8 sm:pt-8">
      <header className="sticky top-0 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">模拟面试</h1>
          {saved && <p className="mt-1 text-sm text-slate-600">{saved.input.track}</p>}
        </div>
        {activeRound && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900" aria-label={`第 ${activeRound.index} 题，共 4 题`}>第 {activeRound.index}/4 题</p>}
      </header>

      {!ready && <p role="status" className="text-sm text-slate-600">正在读取面试进度…</p>}
      {ready && !saved && (
        <div className="space-y-4 rounded-xl border border-border p-5">
          <p className="text-sm text-slate-700">填写项目经历后开始面试，也可以先用示例项目体验。</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/">填写项目经历</Link></Button>
            <Button variant="outline" onClick={() => {
              const snapshot = { input: demoInput, state: null, draft: "" };
              save(snapshot);
              start(snapshot);
            }}>用示例项目开始</Button>
          </div>
        </div>
      )}
      {state && (
        <ol aria-label="面试对话" className="space-y-6">
          {state.session.rounds.map((round) => {
            const current = activeRound?.index === round.index ? active : null;
            const feedback = state.feedback[round.index - 1];
            return (
              <li key={`${state.session.id}-${round.index}`} className="min-w-0 space-y-3" aria-label={`第 ${round.index} 题`}>
                <QuestionCard question={round.question} anchor={round.anchor} animate={animate && current?.phase === "question"} />
                {round.answer && <AnswerCard answer={round.answer} />}
                {round.followups.map(({ question, answer }, index) => (
                  <div key={index} className="space-y-3">
                    <QuestionCard question={question} followup={index + 1} animate={false} />
                    {answer && <AnswerCard answer={answer} />}
                  </div>
                ))}
                {current?.phase === "followup" && (
                  <QuestionCard key={round.followups.length} question={current.current.question} followup={round.followups.length + 1} animate={animate} />
                )}
                {feedback && <FeedbackCard result={feedback} index={round.index} />}
              </li>
            );
          })}
        </ol>
      )}
      {active?.hint && <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm leading-6 text-amber-950">{active.hint}</p>}
      {busy && <p role="status" className="mt-3 text-sm text-slate-600">{busy}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      {storageError && <p role="alert" className="mt-3 text-sm text-red-800">浏览器暂时无法保存进度，刷新可能丢失本次更改。</p>}
      <div ref={latest} className="scroll-mb-4" />

      {saved && !state && !busy && <Button className="mt-4" onClick={() => start(saved)}>重试开始面试</Button>}
      {saved && active && (
        <form onSubmit={sendAnswer} className="mt-5 rounded-xl border border-border bg-white p-3 shadow-sm sm:p-4" aria-label="回答当前问题">
          <label htmlFor="interview-answer" className="text-sm font-medium">你的回答</label>
          <textarea
            id="interview-answer"
            value={saved.draft}
            readOnly={Boolean(busy)}
            onChange={(event) => save({ ...(latestSaved.current ?? saved), draft: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault();
                sendAnswer();
              }
            }}
            rows={3}
            placeholder="输入你的回答"
            aria-describedby="answer-shortcuts"
            className="mt-2 block w-full resize-y rounded-lg border border-border px-3 py-2 text-base leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
          <p id="answer-shortcuts" className="mt-2 text-xs text-slate-600">Enter 发送 · Shift+Enter 换行</p>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={Boolean(busy) || (!recording && (voice.phase !== "idle" || !voice.canStart))}
                onClick={() => recording ? voice.stop() : void voice.start()}>
                {recording ? <Square size={16} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
                {recording ? "停止并转写" : "开始录音"}
              </Button>
              {voice.phase !== "idle" && <Button type="button" variant="outline" onClick={voice.cancel}>
                {voice.phase === "transcribing" ? "取消转写" : "取消录音"}
              </Button>}
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("正在跳到下一题…", () => engine.skipQuestion(active), latestSaved.current ?? saved)}>跳过此题</Button>
            </div>
            <Button type="submit" disabled={Boolean(busy) || !saved.draft.trim()}><Send size={16} aria-hidden="true" /> 发送</Button>
          </div>
          {voiceStatus && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <p role="status">{voiceStatus}</p>
            {recording && <>
              <span role="timer" className="tabular-nums">{voice.seconds} / 60 秒</span>
              <span aria-hidden="true" className="h-2 w-12 overflow-hidden rounded-full bg-slate-200">
                <span className="block h-full origin-left rounded-full bg-red-600 motion-safe:transition-transform" style={{ transform: `scaleX(${Math.max(0.08, voice.level)})` }} />
              </span>
            </>}
          </div>}
          {voice.error && <p role="alert" className="mt-2 text-sm leading-6 text-red-800">{voice.error}</p>}
          {voice.unavailable && <p className="mt-2 text-sm leading-6 text-slate-600">{voice.unavailable}</p>}
          <div className="mt-3 border-t border-border pt-3">
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("正在生成复盘…", () => engine.endInterview(active), latestSaved.current ?? saved, true)}>结束并看报告</Button>
          </div>
        </form>
      )}
      {saved && state?.phase === "completed" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <p role="status" className="text-sm font-semibold">本次面试已结束</p>
          <Button onClick={() => { if (save(saved)) router.push("/report"); }}>查看报告</Button>
        </div>
      )}
    </main>
  );
}
