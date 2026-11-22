"use client";

import { Bot, ClipboardCheck, Mic, Send, Square, Volume2 } from "lucide-react";
import { useVoiceInput } from "@/lib/use-voice-input";
import { useQuestionTts } from "@/lib/use-question-tts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { createInterviewEngine, interviewQuestionCount, NetworkError, type InterviewResult, type InterviewState } from "@/lib/engine";
import { hasSubmittedAnswer, interviewInputKey, interviewSessionKey, practiceStorageKey, readInterviewStorage, saveInterview, type SavedInterview } from "@/lib/interview-storage";
import { getTrackPreset } from "@/lib/presets";
import { queueReportGeneration } from "@/lib/report-generation";
import type { Feedback, ProjectInput } from "@/lib/types";
import { cn } from "@/lib/utils";

const engine = createInterviewEngine();
const demoCountKey = "zhui-mian:demo-count";
const demoBlocks = [
  "为商品列表接口加了 Redis 缓存，做了性能优化，用户反馈良好。",
  "负责商品列表分页，补过分页边界测试，处理了翻页时重复和漏数据的问题。",
  "根据用户反馈分析，调整了发布失败时的状态提示，减少了用户的重复提交。",
  "上线前整理了检查清单，接入了监控告警，跟着学长处理过一次线上故障。",
];

// 每次体验按顺序轮换起句，让连续几场的首题锚点分散在四个方向。
function createDemoInput(): ProjectInput {
  let count = Math.floor(Math.random() * demoBlocks.length);
  try {
    const saved = localStorage.getItem(demoCountKey);
    if (saved !== null) count = Number(saved);
    if (!Number.isFinite(count)) count = 0;
    localStorage.setItem(demoCountKey, String(count + 1));
  } catch {
    // 浏览器限制存储时使用本次随机起点。
  }
  const offset = count % demoBlocks.length;
  const blocks = [...demoBlocks.slice(offset), ...demoBlocks.slice(0, offset)];
  return {
    projectText: `${blocks.join("")}项目是校园二手交易小程序，我负责后端接口开发与上线维护。`,
    track: "后端开发",
    source: "demo",
  };
}

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

function questionId(sessionId: string, round: number, followup = 0) {
  return `${sessionId}:${round}:${followup}`;
}

function QuestionCard({ question, anchor, followup, animate, read }: {
  question: string;
  anchor?: string;
  followup?: number;
  animate: boolean;
  read: { active: boolean; disabled: boolean; onClick: () => void } | null;
}) {
  return (
    <article className={cn("min-w-0 rounded-xl border p-4 sm:p-5", followup
      ? "ml-3 border-violet-200 border-l-4 bg-violet-50 sm:ml-7"
      : "border-blue-200 bg-blue-50")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn("flex items-center gap-2 text-sm font-semibold", followup ? "text-violet-800" : "text-blue-800")}>
          <Bot size={17} aria-hidden="true" />
          {followup ? `追问 ${followup}` : "面试官提问"}
        </h3>
        {read && <Button type="button" variant="outline" className="px-3" disabled={read.disabled} onClick={read.onClick}>
          {read.active ? <Square size={15} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
          {read.active ? "停止朗读" : "朗读"}
        </Button>}
      </div>
      {anchor && (
        <blockquote className="mt-3 break-words rounded-md border-l-2 border-blue-500 bg-white px-3 py-2 text-sm leading-6 text-blue-950">
          面试官注意到了你项目经历里的这句：<mark className="bg-blue-100 text-inherit">{anchor}</mark>
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
                  <h4 className="font-semibold text-emerald-900">{rewrite.trim() ? "改写" : "建议补充"}</h4>
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
  const [networkNotice, setNetworkNotice] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [animate, setAnimate] = useState(false);
  const mounted = useRef(false);
  const initialized = useRef(false);
  const inFlight = useRef(false);
  const pendingRetry = useRef<null | (() => void)>(null);
  const latest = useRef<HTMLDivElement>(null);
  const latestSaved = useRef<SavedInterview | null>(null);
  const tts = useQuestionTts();
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
      const state = next.state;
      saveInterview(next, state?.practice ? practiceStorageKey(state.session.id) : interviewSessionKey);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }

  function clearPendingRetry() {
    pendingRetry.current = null;
    setPendingSubmit(false);
    setNetworkNotice("");
  }

  async function run(
    label: string,
    operation: () => Promise<InterviewState>,
    snapshot: SavedInterview,
    options: { retry?: () => void; locked?: boolean } = {},
  ) {
    if (!options.locked) {
      if (inFlight.current) return;
      inFlight.current = true;
    }
    if (!options.retry) clearPendingRetry();
    tts.stop();
    voice.cancel();
    setBusy(label);
    setError("");
    try {
      const state = await operation();
      if (!mounted.current) return;
      pendingRetry.current = null;
      setPendingSubmit(false);
      setNetworkNotice("");
      setAnimate(true);
      save({ ...snapshot, state, draft: "" });
      const round = state.session.rounds.at(-1);
      if (round && state.phase !== "completed" && !voice.isCapturing() && document.visibilityState !== "hidden") {
        const previous = snapshot.state;
        const previousRound = previous?.session.rounds.at(-1);
        const id = questionId(state.session.id, round.index, state.phase === "followup" ? round.followups.length + 1 : 0);
        const previousId = previous && previousRound && questionId(previous.session.id, previousRound.index,
          previous.phase === "followup" ? previousRound.followups.length + 1 : 0);
        if (id !== previousId) void tts.play(id, state.current.question, true);
      }
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof NetworkError && options.retry) {
        pendingRetry.current = options.retry;
        setPendingSubmit(true);
        setNetworkNotice("网络异常，本次回答未送达 AI，已先记录在下方，可重试");
      } else if (caught instanceof NetworkError) {
        setError("网络异常，请检查网络连接后重试。已提交的进度和当前草稿仍在此页。");
      } else {
        setError("操作未完成，请重试。已提交的进度和当前草稿仍在此页。");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  }

  function start(snapshot: SavedInterview) {
    const track = getTrackPreset(snapshot.input.track);
    const anchorHint = snapshot.input.source === "demo"
      ? snapshot.input.projectText.split(/[。！？\n]/)[0]?.trim() || undefined
      : undefined;
    void run("正在准备第一道题…", () => engine.start(snapshot.input, track, undefined, anchorHint), snapshot);
  }

  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.search);
      const practiceId = params.get("practice");
      if (practiceId !== null) {
        const practice = readInterviewStorage<SavedInterview>(practiceStorageKey(practiceId));
        setReady(true);
        if (practice?.state?.practice && practice.state.session.id === practiceId) {
          latestSaved.current = practice;
          setSaved(practice);
          setRestored(true);
        }
        return;
      }
      const input = params.has("demo") ? createDemoInput()
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
        setRestored(Boolean(stored.state));
        if (!stored.state) start(stored);
      }
    }
    return () => { mounted.current = false; };
    // 首次挂载时读取浏览器本地会话，避免每次重新渲染都启动面试。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 恢复联网后自动重试未送达的回答，避免用户手动重发。
    const retry = () => {
      if (!navigator.onLine) return;
      pendingRetry.current?.();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  const state = saved?.state;
  const sessionId = state?.session.id;
  useEffect(() => {
    if (sessionId) router.prefetch(`/report?id=${encodeURIComponent(sessionId)}`);
  }, [router, sessionId]);
  useEffect(() => {
    if (state) latest.current?.scrollIntoView({ block: "nearest" });
  }, [state, busy]);

  const activeRound = state?.session.rounds.at(-1);
  const totalQuestions = interviewQuestionCount(state);
  const active = state && state.phase !== "completed" ? state : null;
  const answeredSession = state?.phase === "completed" && state.session.rounds.some(hasSubmittedAnswer);

  function submitState(stateToSubmit: Extract<InterviewState, { phase: "question" | "followup" }>) {
    const snapshot = latestSaved.current;
    if (inFlight.current || !snapshot?.draft.trim()) return;
    const answer = snapshot.draft;
    const isLastMain = stateToSubmit.phase === "question" && stateToSubmit.session.rounds.length >= interviewQuestionCount(stateToSubmit);
    // 从点击起同步上锁，直到状态更新完成前都不会再接受第二次提交。
    inFlight.current = true;
    void run(
      isLastMain ? "正在生成复盘报告，约需 1 分钟…" : "面试官正在处理回答…",
      () => engine.submitAnswer(stateToSubmit, answer),
      snapshot,
      { locked: true, retry: () => submitState(stateToSubmit) },
    );
  }

  function sendAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (inFlight.current || !active) return;
    submitState(active);
  }

  function retryPendingSubmit() {
    if (inFlight.current) return;
    pendingRetry.current?.();
  }

  function endAndOpenReport() {
    if (!active || inFlight.current) return;
    const snapshot = latestSaved.current;
    if (!snapshot) return;
    if (!active.session.rounds.some(hasSubmittedAnswer)) {
      void run("正在结束面试…", () => engine.endInterview(active), snapshot);
      return;
    }
    tts.stop();
    voice.cancel();
    clearPendingRetry();
    try {
      queueReportGeneration(
        active,
        snapshot,
        active.practice ? practiceStorageKey(active.session.id) : interviewSessionKey,
      );
    } catch {
      setError("浏览器无法保存生成任务，请重试。");
      return;
    }
    router.push(`/report?id=${encodeURIComponent(active.session.id)}`);
  }

  const recording = voice.phase === "recording";

  function questionRead(id: string, text: string) {
    if (tts.unavailable.has(id)) return null;
    return {
      active: tts.activeId === id,
      disabled: Boolean(busy) || voice.waitingForPermission || recording,
      onClick: () => {
        if (inFlight.current || voice.isCapturing()) return;
        if (tts.activeId === id) tts.stop();
        else void tts.play(id, text);
      },
    };
  }

  const voiceStatus = voice.phase === "permission" ? "等待麦克风授权…"
    : recording ? "正在录音" : voice.phase === "transcribing" ? "正在转写…" : voice.notice;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-5 sm:px-8 sm:pt-8">
      <header className="sticky top-0 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{state?.practice ? "同题重练" : "模拟面试"}</h1>
          {saved && <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{saved.input.track}</p>}
          {restored && saved?.state && <p className="mt-1 text-xs text-slate-500">进度已自动保存在本浏览器</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" role="switch" className="size-4 accent-primary" checked={tts.autoRead}
              onChange={(event) => tts.changeAutoRead(event.currentTarget.checked)} />
            自动朗读
          </label>
          {activeRound && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900" aria-label={`第 ${activeRound.index} 题，共 ${totalQuestions} 题`}>第 {activeRound.index}/{totalQuestions} 题</p>}
        </div>
      </header>

      {!ready && <p role="status" className="text-sm text-slate-600">正在读取面试进度…</p>}
      {ready && !saved && (
        <div className="space-y-4 rounded-xl border border-border p-5">
          <p className="text-sm text-slate-700">填写项目经历后开始面试，也可以先用示例项目体验。</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/">填写项目经历</Link></Button>
            <Button variant="outline" onClick={() => {
              const snapshot = { input: createDemoInput(), state: null, draft: "" };
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
                <QuestionCard question={round.question} anchor={round.anchor} animate={animate && current?.phase === "question"}
                  read={questionRead(questionId(state.session.id, round.index), round.question)} />
                {round.answer && <AnswerCard answer={round.answer} />}
                {round.followups.map(({ question, answer }, index) => (
                  <div key={index} className="space-y-3">
                    <QuestionCard question={question} followup={index + 1} animate={false}
                      read={questionRead(questionId(state.session.id, round.index, index + 1), question)} />
                    {answer && <AnswerCard answer={answer} />}
                  </div>
                ))}
                {current?.phase === "followup" && (
                  <QuestionCard key={round.followups.length} question={current.current.question} followup={round.followups.length + 1} animate={animate}
                    read={questionRead(questionId(state.session.id, round.index, round.followups.length + 1), current.current.question)} />
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
      {networkNotice && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        <p>{networkNotice}</p>
        {pendingSubmit && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={retryPendingSubmit}>重试提交</Button>}
      </div>}
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
                onClick={() => {
                  if (recording) voice.stop();
                  else {
                    tts.stop();
                    void voice.start();
                  }
                }}>
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
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={endAndOpenReport}>结束并看报告</Button>
          </div>
        </form>
      )}
      {saved && state?.phase === "completed" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <p role="status" className="text-sm font-semibold">本次面试已结束</p>
          {answeredSession
            ? <Button onClick={() => { if (save(saved)) router.push(`/report?id=${encodeURIComponent(state.session.id)}`); }}>查看报告</Button>
            : <p className="text-sm text-slate-600">本次面试未作答，无报告可生成</p>}
        </div>
      )}
    </main>
  );
}
