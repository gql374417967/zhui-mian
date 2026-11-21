import { scoredRounds } from "./interview-practice";
import { interviewTime, type CompletedInterview } from "./interview-storage";
import type { Report, Round } from "./types";

export type ComparisonEvidence = { score: number; anchor: string; feedbackSummary: string | null };
export type PracticeCompareRequest = { questions: { original: ComparisonEvidence; practice: ComparisonEvidence }[] };
export type PracticeCompareResponse = { summary: string };

type ComparedQuestion = Pick<Round, "index" | "question"> & { score?: number; evidence?: ComparisonEvidence };
export type ComparisonRow = { original?: ComparedQuestion; current?: ComparedQuestion };

export const feedbackSummaryLimit = 240;
export const scoreDifference = (original: number, current: number) => Number((current - original).toFixed(10));

const radarAxes = ["事实与数据", "个人贡献", "技术深度", "结果导向", "逻辑表达"] as const;

function compareRadar(original: CompletedInterview, current: CompletedInterview) {
  if (original.report.format !== "json" || current.report.format !== "json") return [];
  const first: Report["radar"] = original.report.value.radar;
  const second: Report["radar"] = current.report.value.radar;
  return radarAxes.map((label) => ({ label, original: first[label], current: second[label] }));
}

const sameQuestion = (a: Pick<Round, "question" | "anchor">, b: Pick<Round, "question" | "anchor">) =>
  a.question === b.question && a.anchor === b.anchor;

export function compareInterviews(first: CompletedInterview, second: CompletedInterview, includeUnpracticed = false) {
  const firstIsPractice = first.practice?.sourceId === second.session.id;
  const secondIsPractice = second.practice?.sourceId === first.session.id;
  const reverse = firstIsPractice || (!secondIsPractice && interviewTime(first).localeCompare(interviewTime(second)) > 0);
  const [original, current] = reverse ? [second, first] : [first, second];
  const practice = current.practice?.sourceId === original.session.id ? current.practice : undefined;
  const originalScores = new Map(scoredRounds(original).map(({ round, score }) => [round.index, score]));
  const currentScores = new Map(scoredRounds(current).map(({ round, score }) => [round.index, score]));
  const rows: ComparisonRow[] = [];
  const questions: PracticeCompareRequest["questions"] = [];

  function describe(interview: CompletedInterview, round: Round | undefined, score: number | undefined): ComparedQuestion | undefined {
    if (!round) return;
    if (score === undefined) return { index: round.index, question: round.question };
    const result = interview.feedback[round.index - 1];
    const feedback = result?.format === "json" ? result.value : round.feedback;
    const summary = feedback?.oneTip?.trim() || feedback?.missed?.[0]?.trim();
    return {
      index: round.index, question: round.question, score,
      evidence: { score, anchor: round.anchor, feedbackSummary: summary?.slice(0, feedbackSummaryLimit) || null },
    };
  }

  if (practice) {
    const candidates = scoredRounds(original).filter(({ round }) =>
      round.question.trim() && round.anchor.trim() && original.session.input.projectText.includes(round.anchor)
    ).sort((a, b) => a.score - b.score || a.round.index - b.round.index);
    const matched = new Set<number>();
    practice.questions.forEach((question, position) => {
      const index = position + 1;
      const prior = candidates.find(({ round }) => !matched.has(round.index) && sameQuestion(round, question));
      if (prior) matched.add(prior.round.index);
      const attempt = current.session.rounds.find((round) => round.index === index && sameQuestion(round, question));
      const before = describe(original, prior?.round, prior?.score);
      const after = describe(current, attempt, currentScores.get(index)) ?? { index, question: question.question };
      rows.push({ original: before, current: after });
      if (before?.evidence && after.evidence) questions.push({ original: before.evidence, practice: after.evidence });
    });
    if (includeUnpracticed) {
      for (const round of original.session.rounds) {
        if (!matched.has(round.index)) rows.push({ original: describe(original, round, originalScores.get(round.index)) });
      }
    }
  } else {
    const originals = new Map(original.session.rounds.map((round) => [round.index, round]));
    const currents = new Map(current.session.rounds.map((round) => [round.index, round]));
    const indexes = [...new Set([...originals.keys(), ...currents.keys()])].sort((a, b) => a - b);
    for (const index of indexes) {
      rows.push({
        original: describe(original, originals.get(index), originalScores.get(index)),
        current: describe(current, currents.get(index), currentScores.get(index)),
      });
    }
  }

  return { original, current, sameQuestions: Boolean(practice), rows, radar: compareRadar(original, current), questions };
}