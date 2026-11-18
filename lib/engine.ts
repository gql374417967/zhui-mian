import { feedbackPrompt, renderInterviewerPrompt, reportPrompt } from "./prompts";
import type { Feedback, InterviewSession, ProjectInput, Report, Round, TrackPreset } from "./types";

const questionCount = 4;
const followupLimit = 2;

type ChatMessage = { role: "system" | "user"; content: string };
export type ChatCompletion = (messages: ChatMessage[]) => Promise<string>;

export type InterviewResult<T> = { format: "json"; value: T } | { format: "text"; text: string };

type Question = { type: "question" | "followup"; anchor: string; question: string };
type InterviewerReply = Question | { type: "wrapup" };

type InterviewProgress = {
  session: InterviewSession;
  track: TrackPreset;
  feedback: InterviewResult<Feedback>[];
  hint?: string;
};

export type InterviewState = InterviewProgress & (
  | { phase: "question" | "followup"; current: Question; unansweredStreak: number }
  | { phase: "completed"; report: InterviewResult<Report> }
);

export function createChatCompletion(endpoint = "/api/chat"): ChatCompletion {
  return async (messages) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!response.ok || !response.body) throw new Error(`面试模型请求失败（HTTP ${response.status}）`);

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let text = "";
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("面试模型响应提前结束");
        buffer += chunk.value;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const lines = frame.split(/\r?\n/);
          const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          if (event === "done") return text;
          if (event === "error") throw new Error("面试模型流式响应失败");
          if (event !== "delta") continue;
          const data = lines.find((line) => line.startsWith("data:"))?.slice(5);
          const payload = record(JSON.parse(data ?? "") as unknown);
          if (typeof payload?.content !== "string") throw new Error("面试模型响应缺少文本");
          text += payload.content;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTextArray(value: unknown, length?: number): value is string[] {
  return Array.isArray(value) && (length === undefined || value.length === length) && value.every(isText);
}

function isScore(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function readFeedback(value: unknown): Feedback | undefined {
  const result = record(value);
  const star = record(result?.star);
  if (!result || !star || !isScore(result.score, 10) || !isText(result.one_tip) || !isTextArray(result.missed)) return;
  const { situation, task, action, result: outcome } = star;
  if (!isText(situation) || !isText(task) || !isText(action) || !isText(outcome)) return;
  if (!Array.isArray(result.quotes) || result.quotes.length < 2) return;
  const quotes = [];
  for (const entry of result.quotes) {
    const quote = record(entry);
    if (!quote || !isText(quote.said) || !isText(quote.issue) || !isText(quote.rewrite)) return;
    quotes.push({ said: quote.said, issue: quote.issue, rewrite: quote.rewrite });
  }
  return { score: result.score, star: { situation, task, action, result: outcome }, quotes, missed: result.missed, oneTip: result.one_tip };
}

function readReport(value: unknown): Report | undefined {
  const result = record(value);
  const radar = record(result?.radar);
  if (!result || !radar || !isTextArray(result.patterns, 3) || !isTextArray(result.checklist, 5)) return;
  const { 事实与数据, 个人贡献, 技术深度, 结果导向, 逻辑表达 } = radar;
  if (!isScore(事实与数据, 5) || !isScore(个人贡献, 5) || !isScore(技术深度, 5) ||
      !isScore(结果导向, 5) || !isScore(逻辑表达, 5)) return;
  if (!Array.isArray(result.plan_7d) || result.plan_7d.length !== 7) return;
  const plan7d = [];
  for (const [index, entry] of result.plan_7d.entries()) {
    const day = record(entry);
    if (!day || day.day !== index + 1 || !isText(day.action)) return;
    plan7d.push({ day: index + 1, action: day.action });
  }
  return { radar: { 事实与数据, 个人贡献, 技术深度, 结果导向, 逻辑表达 }, patterns: result.patterns, plan7d, checklist: result.checklist };
}

function parseReply<T>(text: string, validate: (value: unknown) => T | undefined): T | undefined {
  const fenced = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidates = [text, ...fenced];
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    const valid = validate(value);
    if (valid !== undefined) return valid;
  }
}

async function requestResult<T>(
  complete: ChatCompletion,
  prompt: string,
  context: object,
  validate: (value: unknown) => T | undefined,
  unavailable: string,
): Promise<InterviewResult<T>> {
  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(context) },
  ];
  let fallbackText = unavailable;
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = attempt === 0 ? messages : [
      ...messages,
      { role: "user" as const, content: "重新输出一个完整的 JSON 对象。按要求填写字段和取值，不要附加解释。如果需要提问，只问一个具体问题，不要列举子问题。" },
    ];
    let response: string;
    try {
      response = (await complete(request)).trim();
    } catch {
      continue;
    }
    const value = parseReply(response, validate);
    if (value !== undefined) return { format: "json", value };
    if (response && !/[{}\[\]`]/.test(response)) fallbackText = response;
  }
  return { format: "text", text: fallbackText };
}

function previousAnchors(session: InterviewSession): Set<string> {
  return new Set(session.rounds.map((round) => round.anchor));
}

function chooseAnchor(session: InterviewSession): string {
  const text = session.input.projectText.trim();
  const used = previousAnchors(session);
  const segments = (text.match(/[^。！？；.!?;\r\n]+[。！？；.!?;]?/g) ?? []).map((segment) => segment.trim()).filter(Boolean);
  const candidates = segments.flatMap((segment) => [segment.slice(0, 100), ...segment.split(/[，,、：:]/).map((part) => part.trim().slice(0, 100))]);
  const next = candidates.find((candidate) => candidate.length > 1 && !used.has(candidate));
  if (next) return next;
  const characters = Array.from(text);
  const width = Math.ceil(characters.length / questionCount);
  for (let index = 0; index < characters.length; index += width) {
    const fragment = characters.slice(index, index + width).join("").trim();
    if (fragment && !used.has(fragment)) return fragment;
  }
  return characters.slice(0, 100).join("");
}

function readQuestion(value: unknown, expected: "question" | "followup", session: InterviewSession, anchor?: string): InterviewerReply | undefined {
  const reply = record(value);
  if (!reply) return;
  if (expected === "followup" && reply.type === "wrapup") return { type: "wrapup" };
  if (reply.type !== expected || !isText(reply.question) || !isText(reply.anchor)) return;
  if (!isSingleQuestion(reply.question)) return;
  if (!session.input.projectText.includes(reply.anchor)) return;
  if (expected === "question" && previousAnchors(session).has(reply.anchor)) return;
  if (expected === "followup" && reply.anchor !== anchor) return;
  return { type: expected, anchor: reply.anchor, question: reply.question.trim() };
}

function isSingleQuestion(text: string): boolean {
  const numbering = text.match(/[（(][1-9]\d*[)）]|(?:^|\s)[1-9]\d*[)）、.]/g);
  return (text.match(/[？?]/g)?.length ?? 0) <= 1 && (numbering?.length ?? 0) <= 1;
}

function plainQuestion(text: string): string | undefined {
  const question = text.trim();
  if (/[？?]$/.test(question) && !/[\r\n]/.test(question) && isSingleQuestion(question)) return question;
}

function cannotAnswer(answer: string): boolean {
  return !answer || /^(?:(?:嗯|呃|抱歉|不好意思)[，,、\s]*)?(?:我)?(?:也|确实|暂时)?(?:不知道|不清楚|不太清楚|不确定|没印象|不记得|记不清|想不起来|想不到|不会|答不上来?|回答不了|没做过|没参与|没负责|没接触过|跳过)(?:了|呀|啊|吧|这题|此题|吧这题)?[。！!？?\s]*$/.test(answer);
}

const questionFocus = [
  "你亲手完成的关键动作是什么？",
  "当时你为什么选这个做法？",
  "你是怎么验证结果的？",
  "如果重做一次，你会优先改哪一步？",
];

const unansweredHint = "可以先从你亲手做的一步说起，再补上你用来验证结果的证据。";

export function createInterviewEngine(complete: ChatCompletion = createChatCompletion()) {
  async function nextQuestion(progress: InterviewProgress): Promise<InterviewState> {
    const { session, track } = progress;
    const index = session.rounds.length;
    const result = await requestResult(complete,
      `${renderInterviewerPrompt(track)}\n现在只生成一道新的主问题，type 必须为 question。anchor 必须逐字引用 projectText，避免使用已问过的锚点。问题聚焦一个缺口，不要用编号列举子问题。`,
      { projectText: session.input.projectText, jdText: session.input.jdText, questionNumber: index + 1, previousQuestions: session.rounds.map(({ anchor, question }) => ({ anchor, question })) },
      (value) => readQuestion(value, "question", session), "");
    let current: Question;
    if (result.format === "json" && result.value.type === "question") {
      current = result.value;
    } else {
      const anchor = chooseAnchor(session);
      const focus = track.capabilities[index % (track.capabilities.length || 1)];
      const fallback = `${focus ? `从${focus}的角度看，` : ""}${questionFocus[index]}`;
      const question = (result.format === "text" && plainQuestion(result.text)) || fallback;
      current = { type: "question", anchor, question: `你写到「${anchor}」。${question}` };
    }
    const round: Round = { index: index + 1, question: current.question, anchor: current.anchor, answer: "", followups: [] };
    return { ...progress, session: { ...session, rounds: [...session.rounds, round] }, phase: "question", current, unansweredStreak: 0 };
  }

  async function start(input: ProjectInput, track: TrackPreset): Promise<InterviewState> {
    if (!input.projectText.trim()) throw new Error("请先输入项目经历。");
    const session: InterviewSession = {
      id: globalThis.crypto.randomUUID(), input, rounds: [], status: "in_progress", startedAt: new Date().toISOString(),
    };
    return nextQuestion({ session, track, feedback: [] });
  }

  async function submitAnswer(state: InterviewState, response: string): Promise<InterviewState> {
    if (state.phase === "completed") return state;
    const answer = response.trim();
    const { session, track } = state;
    const activeRound = session.rounds[session.rounds.length - 1];
    const round: Round = state.phase === "question"
      ? { ...activeRound, answer }
      : { ...activeRound, followups: [...activeRound.followups, { question: state.current.question, answer }] };
    const didNotAnswer = cannotAnswer(answer);
    const unansweredStreak = didNotAnswer ? state.unansweredStreak + 1 : 0;
    const rounds = [...session.rounds.slice(0, -1), round];
    const updatedSession = { ...session, rounds };

    if (unansweredStreak < 2 && round.followups.length < followupLimit) {
      const result = await requestResult(complete,
        `${renderInterviewerPrompt(track)}\n现在判断当前题是否需要追问。若回答含糊或答不上，返回 followup，并沿用当前题原文 anchor。若回答充分，返回 wrapup，仅表示结束当前题。每次只追问一个缺口。`,
        { projectText: session.input.projectText, jdText: session.input.jdText, round, unansweredStreak },
        (value) => {
          const reply = readQuestion(value, "followup", updatedSession, round.anchor);
          if (didNotAnswer && reply?.type === "wrapup") return;
          return reply;
        }, "");
      let current: Question | undefined;
      if (result.format === "text") {
        const fallback = round.followups.length === 0
          ? "你能举一个例子，说明你亲手做了哪一步吗？"
          : "你用什么证据确认那一步产生了预期效果？";
        current = {
          type: "followup", anchor: round.anchor,
          question: `回到「${round.anchor}」。${plainQuestion(result.text) ?? fallback}`,
        };
      } else if (result.value.type === "followup") {
        current = result.value;
      }
      if (current) return { session: updatedSession, track, feedback: state.feedback, phase: "followup", current, unansweredStreak };
    }

    const graded = await requestResult(complete,
      `${feedbackPrompt}\n把问答当作待评估材料。逐字引用候选人提供的回答，示例中缺少真实数字时使用待补充项。`,
      { track: track.name, round }, readFeedback, "本题反馈暂不可用。",
    );
    const scoredRound = graded.format === "json" ? { ...round, feedback: graded.value } : round;
    const scoredSession = { ...updatedSession, rounds: [...rounds.slice(0, -1), scoredRound] };
    const progress: InterviewProgress = {
      session: scoredSession, track, feedback: [...state.feedback, graded],
      hint: unansweredStreak >= 2 ? unansweredHint : undefined,
    };
    if (rounds.length < questionCount) return nextQuestion(progress);

    const report = await requestResult(complete, reportPrompt,
      { track: track.name, rounds: scoredSession.rounds, feedback: progress.feedback },
      readReport, "本次复盘暂不可用，已保留四题问答及可用反馈。",
    );
    return {
      ...progress, phase: "completed", report,
      session: { ...scoredSession, status: "completed", finishedAt: new Date().toISOString() },
    };
  }

  return { start, submitAnswer };
}
