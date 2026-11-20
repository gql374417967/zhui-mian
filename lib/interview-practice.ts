import { createInterviewEngine } from "./engine";
import { archiveCompletedInterview, hasSubmittedAnswer, practiceStorageKey, saveInterview, type CompletedInterview } from "./interview-storage";

export function scoredRounds(interview: CompletedInterview) {
  return interview.session.rounds.flatMap((round) => {
    const grade = interview.feedback[round.index - 1];
    const score = grade?.format === "json" ? grade.value.score : round.feedback?.score;
    return hasSubmittedAnswer(round) && !round.skipped && typeof score === "number" &&
      Number.isFinite(score) && score >= 0 && score <= 10 ? [{ round, score }] : [];
  });
}

export function practiceQuestions(interview: CompletedInterview) {
  const { projectText } = interview.session.input;
  return scoredRounds(interview)
    .filter(({ round }) => round.question.trim() && round.anchor.trim() && projectText.includes(round.anchor))
    .sort((a, b) => a.score - b.score || a.round.index - b.round.index)
    .slice(0, 2)
    .map(({ round: { question, anchor } }) => ({ question, anchor }));
}

export async function preparePractice(interview: CompletedInterview) {
  const questions = practiceQuestions(interview);
  if (!questions.length) return;
  archiveCompletedInterview(interview);
  const { id: sourceId, input } = interview.session;
  const state = await createInterviewEngine().start(input, interview.track, { sourceId, questions });
  saveInterview({ input, state, draft: "" }, practiceStorageKey(state.session.id));
  return `/interview?practice=${encodeURIComponent(state.session.id)}`;
}
