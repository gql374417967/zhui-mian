import type { InterviewState } from "./engine";
import type { ProjectInput, Round } from "./types";

export const interviewInputKey = "zhui-mian:interview-input";
export const interviewSessionKey = "zhui-mian:interview-session";
const latestReportKey = "zhui-mian:latest-report";

export type SavedInterview = {
  input: ProjectInput;
  state: InterviewState | null;
  draft: string;
};

type CompletedInterview = Extract<InterviewState, { phase: "completed" }>;

export function practiceStorageKey(id: string) {
  return `zhui-mian:practice:${id}`;
}

export function planStorageKey(id: string) {
  return `zhui-mian:plan:${id}`;
}

function reportStorageKey(id: string) {
  return `zhui-mian:report:${id}`;
}

export function readInterviewStorage<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}

export function hasSubmittedAnswer(round: Round) {
  return Boolean(round.answer.trim() || round.followups.some(({ answer }) => answer.trim()));
}

function isCompleted(state: InterviewState | null | undefined): state is CompletedInterview {
  return state?.phase === "completed" && state.session?.status === "completed" &&
    typeof state.session.id === "string" && Array.isArray(state.session.rounds) &&
    Array.isArray(state.feedback) && (state.report?.format === "json" || state.report?.format === "text");
}

export function archiveCompletedInterview(state: InterviewState | null | undefined) {
  if (!isCompleted(state) || !state.session.rounds.some(hasSubmittedAnswer)) return;
  const { id, finishedAt = "" } = state.session;
  localStorage.setItem(reportStorageKey(id), JSON.stringify(state));
  const latest = readInterviewStorage<{ id: string; finishedAt: string }>(latestReportKey);
  if (!latest || latest.finishedAt <= finishedAt) {
    localStorage.setItem(latestReportKey, JSON.stringify({ id, finishedAt }));
  }
}

export function readCompletedInterview(id?: string): CompletedInterview | undefined {
  const latest = id ?? readInterviewStorage<{ id: string }>(latestReportKey)?.id;
  const archived = latest ? readInterviewStorage<CompletedInterview>(reportStorageKey(latest)) : undefined;
  if (isCompleted(archived) && archived.session.id === latest && archived.session.rounds.some(hasSubmittedAnswer)) return archived;

  const legacy = readInterviewStorage<SavedInterview>(interviewSessionKey)?.state;
  if (isCompleted(legacy) && (id === undefined || legacy.session.id === id) && legacy.session.rounds.some(hasSubmittedAnswer)) return legacy;
}

export function saveInterview(snapshot: SavedInterview, key = interviewSessionKey) {
  if (key === interviewSessionKey) {
    const previous = readInterviewStorage<SavedInterview>(key)?.state;
    if (isCompleted(previous) && previous.session.id !== snapshot.state?.session.id &&
        !readInterviewStorage(reportStorageKey(previous.session.id))) {
      archiveCompletedInterview(previous);
    }
  }
  archiveCompletedInterview(snapshot.state);
  localStorage.setItem(key, JSON.stringify(snapshot));
}
