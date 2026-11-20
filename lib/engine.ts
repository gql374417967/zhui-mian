import { feedbackPrompt, jdInterviewPriority, renderInterviewerPrompt, reportPrompt } from "./prompts";
import type { Feedback, InterviewSession, ProjectInput, Report, Round, TrackPreset } from "./types";

const questionCount = 4;
const followupLimit = 2;

type ChatMessage = { role: "system" | "user"; content: string };
export type ChatCompletion = (messages: ChatMessage[]) => Promise<string>;

export type InterviewResult<T> = { format: "json"; value: T } | { format: "text"; text: string };

type Question = { type: "question" | "followup"; anchor: string; question: string };
type InterviewerReply = Question | { type: "wrapup" };

type Practice = { sourceId: string; questions: Pick<Round, "question" | "anchor">[] };

type InterviewProgress = {
  practice?: Practice;
  session: InterviewSession;
  track: TrackPreset;
  feedback: InterviewResult<Feedback>[];
  hint?: string;
};

export type InterviewState = InterviewProgress & (
  | { phase: "question" | "followup"; current: Question; unansweredStreak: number }
  | { phase: "completed"; report: InterviewResult<Report> }
);

export function interviewQuestionCount(progress?: InterviewProgress | null) {
  return progress?.practice?.questions.length ?? questionCount;
}

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

function readFeedback(value: unknown, answers: string[]): Feedback | string {
  const result = record(value);
  if (!result) return "反馈必须是 JSON 对象";
  if (!isScore(result.score, 10)) return "score 必须是 0 到 10 之间的数字";
  if (!isText(result.one_tip)) return "one_tip 必须是非空文本";
  if (!isTextArray(result.missed)) return "missed 必须是非空文本组成的数组";
  const star = record(result.star);
  if (!star) return "star 必须是 JSON 对象";
  const { situation, task, action, result: outcome } = star;
  if (!isText(situation) || !isText(task) || !isText(action) || !isText(outcome)) return "star 的 situation、task、action、result 必须是非空文本";
  if (!Array.isArray(result.quotes) || result.quotes.length > 2) return "quotes 必须是包含 0 到 2 条引用的数组";
  const quotes = [];
  for (const [index, entry] of result.quotes.entries()) {
    const quote = record(entry);
    if (!quote || !isText(quote.said) || !isText(quote.issue) || !isText(quote.rewrite)) return `quotes 第 ${index + 1} 条的 said、issue、rewrite 必须是非空文本`;
    const { said, issue, rewrite } = quote;
    if (!answers.some((answer) => answer.includes(said))) {
      return `quotes 第 ${index + 1} 条的 said 未逐字出现在本题的主回答或任何一条追问回答中，请逐字复制或删除该引用`;
    }
    quotes.push({ said, issue, rewrite });
  }
  return { score: result.score, star: { situation, task, action, result: outcome }, quotes, missed: result.missed, oneTip: result.one_tip };
}

function readReport(value: unknown): Report | string {
  const result = record(value);
  if (!result) return "复盘必须是 JSON 对象";
  if (!isTextArray(result.patterns, 3)) return "patterns 必须包含 3 条非空文本";
  if (!isTextArray(result.checklist, 5)) return "checklist 必须包含 5 条非空文本";
  const radar = record(result.radar);
  if (!radar) return "radar 必须是 JSON 对象";
  const { 事实与数据, 个人贡献, 技术深度, 结果导向, 逻辑表达 } = radar;
  if (!isScore(事实与数据, 5) || !isScore(个人贡献, 5) || !isScore(技术深度, 5) ||
      !isScore(结果导向, 5) || !isScore(逻辑表达, 5)) return "radar 的五项分数都必须是 0 到 5 之间的数字";
  if (!Array.isArray(result.plan_7d) || result.plan_7d.length !== 7) return "plan_7d 必须包含 7 条计划";
  const plan7d = [];
  for (const [index, entry] of result.plan_7d.entries()) {
    const day = record(entry);
    if (!day || day.day !== index + 1 || !isText(day.action)) return `plan_7d 第 ${index + 1} 条必须包含对应的 day 和非空的 action`;
    plan7d.push({ day: index + 1, action: day.action });
  }
  return { radar: { 事实与数据, 个人贡献, 技术深度, 结果导向, 逻辑表达 }, patterns: result.patterns, plan7d, checklist: result.checklist };
}

function parseReply<T extends object>(text: string, validate: (value: unknown) => T | string): T | string {
  const fenced = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidates = [text, ...fenced];
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  let validationError: string | undefined;
  for (const candidate of new Set(candidates)) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = validate(value);
    if (typeof result !== "string") return result;
    validationError ??= result;
  }
  return validationError ?? (text ? "未找到可解析的 JSON" : "模型返回了空内容");
}

async function requestResult<T extends object>(
  complete: ChatCompletion,
  prompt: string,
  context: object,
  validate: (value: unknown) => T | string,
  unavailable: string,
  allowPlainText = true,
): Promise<InterviewResult<T>> {
  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(context) },
  ];
  let fallbackText = unavailable;
  let retryReason = "未收到完整的模型响应";
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = attempt === 0 ? messages : [
      ...messages,
      { role: "user" as const, content: `上次失败原因：${retryReason}。请修正后重新输出一个完整的 JSON 对象。按要求填写字段和取值，不要附加解释。如果需要提问，question 只写一句直接问句，围绕一个信息缺口，以一个问号结尾。` },
    ];
    let response: string;
    try {
      response = (await complete(request)).trim();
    } catch {
      continue;
    }
    const value = parseReply(response, validate);
    if (typeof value !== "string") return { format: "json", value };
    retryReason = value;
    if (allowPlainText && response && !/[{}\[\]`]/.test(response)) fallbackText = response;
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

function normalizeAnchor(anchor: string): string {
  return anchor.replace(/^[\s「」『』]+|[\s「」『』]+$/g, "");
}

const resolution = /(?:解决(?:掉)?|修复|修好)了|(?:已(?:经)?|成功|顺利)(?:彻底)?(?:解决|修复|修好)|(?:解决|修复)(?:完成|成功)|(?:怎么|如何|怎样)(?:解决(?:掉)?|修复|修好)的/;
const metrics = ["耗时|时延|延迟|响应时间", "吞吐量", "转化率", "投诉量", "比率", "指标"];
const directions = ["上升|增长|上涨|升高|增加|变长|变慢|提高|提升", "下降|降低|减少|缩短|下滑|变短|变低|变快"];
const metricDirections = metrics.flatMap((metric) => directions.map((direction) => ({
  topic: new RegExp(metric),
  result: new RegExp(`(?:${metric}).{0,18}?(?:${direction})`),
})));
const unconfirmedResult = /未|没|不曾|不知|不清楚|不确定|不一定|无法(?:确认|判断)|不能(?:确认|判断)|待确认|是否|能否|能不能|会不会|有无|考虑|打算|计划|准备|尝试|希望|可能|预计|猜测|怀疑|如果|假如|假设|只要|若/;

function resultSubject(clause: string, match: RegExpExecArray, isResolution: boolean): string {
  const before = clause.slice(0, match.index);
  const after = clause.slice(match.index + match[0].length);
  if (!isResolution) {
    const subject = before.trim().replace(/^.*(?:确认|发现|观察到|测得|记录到|不知道|不确定|未记录)/, "")
      .replace(/^(?:我(?:们)?|你(?:们)?)(?=\S)/, "").replace(/的\s*$/, "").trim();
    return /^(?:(?:具体是)?(?:哪(?:一)?个|哪些|这个|该)?(?:接口|服务))?$/.test(subject) ? "" : subject;
  }
  const subject = after.match(/^\s*([^？?]{1,24}?(?:问题|故障))/)?.[1]
    ?? before.match(/([^？?]{1,24}?(?:问题|故障))[^问题故障]*$/)?.[1];
  const name = (subject ?? "").replace(/^.*(?:确认|发现|已经|最终|后来|我们|你们|看不到|没有|缺少)/, "")
    .replace(/(?:的)?(?:问题|故障)$/, "").trim();
  return /^(?:这个|那个|该|上述|同一)$/.test(name) ? "" : name;
}

function confirmsResult(clause: string, result: RegExp) {
  const match = result.exec(clause);
  if (!match) return false;
  const before = clause.slice(0, match.index);
  const after = clause.slice(match.index + match[0].length);
  // 「没有状态提示的问题已解决」中的否定描述问题本身。
  const qualifier = result === resolution ? before.replace(/(?:没有|缺少|看不到)[^，。；]{0,18}(?:的)?(?:问题|故障)/g, "") : before;
  return !unconfirmedResult.test(qualifier + match[0])
    && !/^\s*(?:还是|与否|不明|未知|待确认|尚不明确|尚不清楚|未确认|不确定)/.test(after)
    && !/(?:了没(?:有)?|吗)\s*[？?]?\s*$/.test(clause);
}

function validateResultPremise(question: string, evidence: string[]): string | undefined {
  const clauses = (text: string) => text.match(/[^，,。；;！？?!\r\n]+[？?]?/g)?.flatMap((clause) => clause.split(/但是|不过|却/)) ?? [];
  const statements = evidence.flatMap((text) => text.match(/[^。；;！？?!\r\n]+[？?]?/g) ?? [])
    .filter((sentence) => !/[？?]\s*$/.test(sentence) && !/^\s*(?:如果|假如|假设|只要|若)/.test(sentence))
    .flatMap(clauses);
  const questionClauses = clauses(question);
  const unsupported = (result: RegExp, topic: RegExp) => questionClauses.some((clause) => {
    const match = result.exec(clause);
    if (!match || !confirmsResult(clause, result)) return false;

    const isResolution = result === resolution;
    const subject = resultSubject(clause, match, isResolution);
    const relevant = statements.flatMap((statement) => {
      const mention = isResolution ? result.exec(statement) ?? topic.exec(statement) : topic.exec(statement);
      if (!mention) return [];
      return [{ subject: resultSubject(statement, mention, isResolution), confirmed: confirmsResult(statement, result) }];
    });
    // 省略对象时，只采纳对象明确且唯一的结果证据。
    const subjects = new Set(relevant.map((item) => item.subject).filter(Boolean));
    const target = subject || (subjects.size === 1 ? [...subjects][0] : "");
    if (!target) return true;
    return relevant.filter((item) => item.subject === target).at(-1)?.confirmed !== true;
  });
  if (unsupported(resolution, /(?<=问题|故障)(?=.{0,12}(?:解决|修复|修好))/)) {
    return "question 预设了问题已经解决，但候选人未确认，请改问目前进展";
  }
  if (metricDirections.some(({ result, topic }) => unsupported(result, topic))) {
    return "question 预设了指标变化方向，但候选人未确认，请开放式询问指标情况";
  }
}

const abTest = /(?:A\s*[/／-]?\s*B\s*(?:实验|测试)|分流实验)/i;

function hasExperimentEvidence(text: string) {
  const statements = text.match(/[^。；！？!?\n]+[？?]?/g) ?? [];
  return statements.some((sentence) => {
    if (/[？?]$/.test(sentence) || /^\s*(?:如果|假如|假设|若)/.test(sentence)) return false;
    return sentence.split(/[，,]/).some((clause) => {
      if (!abTest.test(clause) || unconfirmedResult.test(clause)) return false;
      const personalExecution = /^(?:后来|此前|当时)?\s*我(?:本人|自己|亲自|曾经|曾|当时|也|先|独立|在.{1,20}中)*(?:做过|做了|进行过|进行了|开展过|开展了|实施过|实施了|完成了|运行了|跑了|(?:负责|参与)(?:执行|运行|实施|开展))\s*(?:过|了)?\s*(?:一次|一轮|一项|该项?|本次|这个)?\s*/;
      const action = clause.trim().match(personalExecution);
      if (!action) return false;
      const object = clause.trim().slice(action[0].length);
      return object.search(abTest) === 0 &&
        !/(?:实验|测试)\s*的?\s*(?:报告|结果|材料|总结)/.test(object);
    });
  });
}

function readQuestion(value: unknown, expected: "question" | "followup", session: InterviewSession, currentAnchor?: string): InterviewerReply | string {
  const reply = record(value);
  if (!reply) return "回复必须是 JSON 对象";
  if (expected === "followup" && reply.type === "wrapup") return { type: "wrapup" };
  if (reply.type !== expected) return expected === "question" ? "type 必须为 question" : "type 必须为 followup 或 wrapup";
  if (!isText(reply.question)) return "question 必须是非空文本";
  if (!isSingleQuestion(reply.question)) return "question 只能包含一个问题";
  const currentRound = expected === "followup" ? session.rounds.at(-1) : undefined;
  const evidence = [session.input.projectText, currentRound?.answer ?? "", ...(currentRound?.followups.map(({ answer }) => answer) ?? [])];
  const measurement = /\d+(?:\.\d+)?\s*(?:[%％]|毫秒|秒|分钟|ms\b)|百分之[零一二三四五六七八九十百点\d]+/gi;
  const knownMeasurements = new Set(evidence.flatMap((text) => text.match(measurement) ?? []).map((value) => value.replace(/\s/g, "").toLowerCase()));
  if ((reply.question.match(measurement) ?? []).some((value) => !knownMeasurements.has(value.replace(/\s/g, "").toLowerCase()))) {
    return "question 引用了候选人未提供的量化值，请改用不带阈值的开放式问法";
  }
  const assumesOptimization = /(?:优化了|改进了|做了[^。！？!?]*(?:优化|改进))/;
  if (assumesOptimization.test(reply.question) && !evidence.some((text) => /优化|改进/.test(text))) {
    return "question 预设了候选人做过优化或改进，请改问实际做了什么";
  }
  const experimentDetails = /样本|指标|结果|效果|分组|分流|持续|时长|多久|多长时间/;
  const pastExperiment = /当时|当初|之前|此前|上次|那次|已经做过/;
  const assumesExperiment = /复盘|实验中|测试中|实验时|测试时|怎么做的|如何做的|做了|进行的|实施的/;
  const hypotheticalExperiment = /如果|假如|假设|(?:会|可以|应该|打算|准备)(?:如何|怎么|怎样|用什么|选哪些)/;
  const confirmsExperiment = /^(?:请问\s*)?(?:你(?:们)?\s*)?(?:(?:当时|当初|之前)\s*)?(?:是否\s*|有没有\s*)?(?:做|进行|开展|实施|完成)(?:过|了)?\s*(?:A\s*[/／-]?\s*B\s*(?:实验|测试)|分流实验)\s*(?:吗|没有)?[？?]?$/i;
  if (abTest.test(reply.question) && !confirmsExperiment.test(reply.question.trim()) &&
      (pastExperiment.test(reply.question) || (!hypotheticalExperiment.test(reply.question) &&
        (experimentDetails.test(reply.question) || assumesExperiment.test(reply.question)))) &&
      !evidence.some(hasExperimentEvidence)) {
    return "question 预设了候选人做过 A/B 实验，请先确认是否做过，或用假设式询问会如何设计实验";
  }
  const resultError = validateResultPremise(reply.question, evidence);
  if (resultError) return resultError;
  const anchor = typeof reply.anchor === "string" ? normalizeAnchor(reply.anchor) : "";
  if (!anchor) return "anchor 必须包含非空的原文片段";
  if (!session.input.projectText.includes(anchor)) return "anchor 不在原文中，请从 projectText 逐字复制";
  if (expected === "question" && session.rounds.some((round) => normalizeAnchor(round.anchor) === anchor)) return "anchor 已在前面的主问题使用";
  if (expected === "followup" && (currentAnchor === undefined || normalizeAnchor(currentAnchor) !== anchor)) return "anchor 与当前主问题不同，请沿用 round.anchor";
  return { type: expected, anchor, question: reply.question.trim() };
}

function isSingleQuestion(text: string): boolean {
  if ((text.match(/[？?]/g)?.length ?? 0) > 1) return false;

  const listItem = /^(?:[-+*•]\s+|[（(][\d一二三四五六七八九十]+[)）]|[\d一二三四五六七八九十]+[)）、]|\d+[.．](?!\d))\s*\S/;
  const segments = text.split(/[\r\n；;。！？!?]+|[:：](?!\d)/).map((segment) => segment.trim());
  if (segments.filter((segment) => listItem.test(segment)).length > 1) return false;
  const inlineNumberedPrompts = text.match(/[（(]\d+[)）]\s*(?:请|你(?:们)?(?:是|会|用|怎么|如何|为什么|做了)|怎么|如何|为什么|是否|能否)/g);
  if ((inlineNumberedPrompts?.length ?? 0) > 1) return false;

  const questionWord = /(?:怎么|怎样|如何|为何|为什么|什么|哪些|哪[个种项步次]|多少|是否|有没有|能否|可否)/;
  const separatePrompt = /^(?:请(?:问|说明|描述|解释|介绍|列出|举)|(?:(?:当时)?你们?|同时|另外|此外|然后)?\s*(?:又|还|再)?\s*(?:怎么|怎样|如何|为何|为什么|是什么|有哪些|多少|是否|有没有|能否|可否))|(?:是什么|怎么样|如何|是多少)[？?]?$/;
  const clauses = text.split(/[，,；;。\r\n]+|以及|并且/).map((clause) => clause.trim());
  const firstQuestion = clauses.findIndex((clause) => !/^(?:如果|假如|假设|若)/.test(clause)
    && (questionWord.test(clause) || separatePrompt.test(clause)));
  return firstQuestion === -1 || !clauses.slice(firstQuestion + 1).some((clause) => separatePrompt.test(clause));
}

function questionKey(question: string, anchor: string): string {
  const quote = `「${anchor}」。`;
  let text = question.trim();
  for (const prefix of [`你写到${quote}`, `回到${quote}`]) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trimStart();
      break;
    }
  }
  return text.replace(/[\s。！？.!?…；;，,、：:]+$/u, "");
}

function cannotAnswer(answer: string): boolean {
  return !answer || /^(?:(?:嗯|呃|抱歉|不好意思)[，,、\s]*)?(?:我)?(?:也|确实|暂时)?(?:不知道|不清楚|不太清楚|不确定|没印象|不记得|记不清|想不起来|想不到|不会|答不上来?|回答不了|没做过|没参与|没负责|没接触过|跳过)(?:了|呀|啊|吧|这题|此题|吧这题)?[。！!？?\s]*$/.test(answer);
}

const questionFocus = [
  "你亲手完成的关键动作是什么？",
  "你当时做决定时考虑了什么？",
  "当时你如何了解这项工作的效果？",
  "如果重做一次，你会优先改哪一步？",
];

const followupAngles = [
  "你亲手完成的关键动作是什么？",
  "当时你如何了解这项工作的效果？",
];

const unansweredHint = "可以先从你亲手做的一步说起，再补上你用来验证结果的证据。";

export function createInterviewEngine(complete: ChatCompletion = createChatCompletion()) {
  function questionPrompt(track: TrackPreset, input: ProjectInput) {
    const prompt = renderInterviewerPrompt(track);
    return input.jdAnalysis ? `${prompt}\n${jdInterviewPriority}` : prompt;
  }

  async function nextQuestion(progress: InterviewProgress): Promise<InterviewState> {
    const { session, track } = progress;
    const index = session.rounds.length;
    const original = progress.practice?.questions[index];
    if (original) return openQuestion(progress, { type: "question", ...original });

    const result = await requestResult(complete,
      `${questionPrompt(track, session.input)}\n现在只生成一道新的主问题，type 必须为 question。anchor 必须逐字引用 projectText，避免使用已问过的锚点。只选一个最值得深挖的缺口，question 只写一句问句。`,
      { projectText: session.input.projectText, jdAnalysis: session.input.jdAnalysis, questionNumber: index + 1, previousQuestions: session.rounds.map(({ anchor, question }) => ({ anchor, question })) },
      (value) => readQuestion(value, "question", session), "", false);
    let current: Question;
    if (result.format === "json" && result.value.type === "question") {
      current = result.value;
    } else {
      const anchor = chooseAnchor(session);
      const focus = track.capabilities[index % (track.capabilities.length || 1)];
      const fallback = `${focus ? `从${focus}的角度看，` : ""}${questionFocus[index]}`;
      current = { type: "question", anchor, question: `你写到「${anchor}」。${fallback}` };
    }
    return openQuestion(progress, current);
  }

  function openQuestion(progress: InterviewProgress, current: Question): InterviewState {
    const { session } = progress;
    const round: Round = { index: session.rounds.length + 1, question: current.question, anchor: current.anchor, answer: "", followups: [] };
    return { ...progress, session: { ...session, rounds: [...session.rounds, round] }, phase: "question", current, unansweredStreak: 0 };
  }

  async function start(input: ProjectInput, track: TrackPreset, practice?: Practice): Promise<InterviewState> {
    if (!input.projectText.trim()) throw new Error("请先输入项目经历。");
    const session: InterviewSession = {
      id: globalThis.crypto.randomUUID(), input, rounds: [], status: "in_progress", startedAt: new Date().toISOString(),
    };
    return nextQuestion({ session, track, feedback: [], practice });
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
      const asked = new Set([round.question, ...round.followups.map(({ question }) => question)]
        .map((question) => questionKey(question, round.anchor)));
      const result = await requestResult(complete,
        `${questionPrompt(track, session.input)}\n现在判断当前题是否需要追问。根据本题已有回答选一个尚未问过、值得澄清的点，并沿用 round.anchor。回答已充分或没有合适的新角度时，返回 wrapup。`,
        { projectText: session.input.projectText, jdAnalysis: session.input.jdAnalysis, round, unansweredStreak },
        (value) => {
          const reply = readQuestion(value, "followup", updatedSession, round.anchor);
          if (typeof reply !== "string" && reply.type === "followup" && asked.has(questionKey(reply.question, round.anchor))) {
            return "question 与本题主问题或已有追问重复，请换一个未问过的角度；没有合适的角度就返回 wrapup";
          }
          return reply;
        }, "", false);
      let current: Question | undefined;
      if (result.format === "text") {
        const fallback = followupAngles.find((question) => !asked.has(questionKey(question, round.anchor)));
        if (fallback) current = { type: "followup", anchor: round.anchor, question: `回到「${round.anchor}」。${fallback}` };
      } else if (result.value.type === "followup") {
        current = result.value;
      }
      if (current) return { ...state, session: updatedSession, phase: "followup", current, unansweredStreak };
    }

    return finishRound({ ...state, session: updatedSession }, unansweredStreak >= 2 ? unansweredHint : undefined);
  }

  function hasAnswer(round: Round) {
    return Boolean(round.answer || round.followups.some(({ answer }) => answer));
  }

  async function gradeRound(progress: InterviewProgress, hint?: string): Promise<InterviewProgress> {
    const { session, track, feedback } = progress;
    const round = session.rounds[session.rounds.length - 1];
    const answers = [round.answer, ...round.followups.map(({ answer }) => answer)];
    const graded: InterviewResult<Feedback> = hasAnswer(round)
      ? await requestResult(complete, feedbackPrompt,
        { track: track.name, round }, (value) => readFeedback(value, answers), "本题反馈暂不可用。", false,
      )
      : { format: "text", text: "本题已跳过。" };
    const scoredRound = graded.format === "json" ? { ...round, feedback: graded.value } : round;
    return {
      ...progress,
      session: { ...session, rounds: [...session.rounds.slice(0, -1), scoredRound] },
      feedback: [...feedback, graded], hint,
    };
  }

  async function completeInterview(progress: InterviewProgress): Promise<InterviewState> {
    const { session, track, feedback } = progress;
    const answeredRounds = session.rounds.filter(hasAnswer);
    const report: InterviewResult<Report> = answeredRounds.length
      ? await requestResult(complete, reportPrompt,
        { track: track.name, rounds: answeredRounds, feedback: feedback.filter((_, index) => hasAnswer(session.rounds[index])) },
        readReport, "本次复盘暂不可用，已保留问答及可用反馈。",
      )
      : { format: "text", text: "本次面试没有已提交的回答，暂无法生成复盘。" };
    return {
      ...progress, phase: "completed", report,
      session: { ...session, status: "completed", finishedAt: new Date().toISOString() },
    };
  }

  async function finishRound(progress: InterviewProgress, hint?: string): Promise<InterviewState> {
    const graded = await gradeRound(progress, hint);
    return graded.session.rounds.length < interviewQuestionCount(graded) ? nextQuestion(graded) : completeInterview(graded);
  }

  function preserveUnansweredFollowup(state: InterviewState): InterviewProgress {
    if (state.phase !== "followup") return state;
    const { session, current } = state;
    const round = session.rounds[session.rounds.length - 1];
    const followups = [...round.followups, { question: current.question, answer: "" }];
    return { ...state, session: { ...session, rounds: [...session.rounds.slice(0, -1), { ...round, followups }] } };
  }

  async function skipQuestion(state: InterviewState): Promise<InterviewState> {
    if (state.phase === "completed") return state;
    const progress = preserveUnansweredFollowup(state);
    const { session } = progress;
    const round = { ...session.rounds[session.rounds.length - 1], skipped: true };
    return finishRound({ ...progress, session: { ...session, rounds: [...session.rounds.slice(0, -1), round] } });
  }

  async function endInterview(state: InterviewState): Promise<InterviewState> {
    if (state.phase === "completed") return state;
    const progress = preserveUnansweredFollowup(state);
    const activeRound = progress.session.rounds[progress.session.rounds.length - 1];
    return completeInterview(hasAnswer(activeRound) ? await gradeRound(progress) : progress);
  }

  return { start, submitAnswer, skipQuestion, endInterview };
}
