import type { InterviewState } from "./engine";
import type { ProjectInput, Round } from "./types";

export const interviewInputKey = "zhui-mian:interview-input";
export const interviewSessionKey = "zhui-mian:interview-session";
export const storageEvent = "zhui-mian:storage";
const latestReportKey = "zhui-mian:latest-report";
const ownerKey = "zhui-mian:local-owner";
const scopePrefix = "zhui-mian:account:";

export type SavedInterview = {
  input: ProjectInput;
  state: InterviewState | null;
  draft: string;
};

export type CompletedInterview = Extract<InterviewState, { phase: "completed" }>;
export type Archive = { interview: CompletedInterview; checked: number[] };

export const practiceStorageKey = (id: string) => `zhui-mian:practice:${id}`;
export const planStorageKey = (id: string) => `zhui-mian:plan:${id}`;
const reportStorageKey = (id: string) => `zhui-mian:report:${id}`;
const pendingKey = (id: string) => `zhui-mian:pending:${id}`;
const deletionKey = (owner: string) => `zhui-mian:delete:${owner}`;

export function notifyInterviewStorage() {
  window.dispatchEvent(new Event(storageEvent));
}

export function localOwner() {
  try { return localStorage.getItem(ownerKey) ?? ""; } catch { return ""; }
}

function scopedKey(key: string, owner = localOwner()) {
  return owner ? `${scopePrefix}${owner}:${key}` : key;
}

function storedKeys() {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "");
}

function isInterviewKey(key: string) {
  return key === interviewInputKey || key === interviewSessionKey || key === latestReportKey ||
    /^zhui-mian:(report|plan|practice|pending):/.test(key);
}

export function selectLocalOwner(owner: string, adoptLocal: boolean) {
  if (localOwner() === owner) return;
  if (adoptLocal && !localOwner()) {
    for (const key of storedKeys().filter(isInterviewKey)) {
      const value = localStorage.getItem(key);
      const destination = scopedKey(key, owner);
      if (value !== null && localStorage.getItem(destination) === null) localStorage.setItem(destination, value);
      localStorage.removeItem(key);
    }
    if (!deletionPending(owner)) {
      for (const { interview } of listCompletedInterviews(owner)) markPending(interview.session.id, owner);
    }
  }
  localStorage.setItem(ownerKey, owner);
  notifyInterviewStorage();
}

export function readInterviewStorage<T>(key: string, owner = localOwner()): T | undefined {
  try {
    const value = localStorage.getItem(scopedKey(key, owner));
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}

export function writeInterviewStorage(key: string, value: unknown) {
  localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

export function hasSubmittedAnswer(round: Round) {
  return Boolean(round.answer.trim() || round.followups.some(({ answer }) => answer.trim()));
}

export function isCompletedInterview(state: InterviewState | null | undefined): state is CompletedInterview {
  return state?.phase === "completed" && state.session?.status === "completed" &&
    typeof state.session.id === "string" && Array.isArray(state.session.rounds) &&
    Array.isArray(state.feedback) && (state.report?.format === "json" || state.report?.format === "text") &&
    state.session.rounds.some(hasSubmittedAnswer);
}

function markPending(id: string, owner = localOwner()) {
  localStorage.setItem(scopedKey(pendingKey(id), owner), crypto.randomUUID());
}

function writeArchive(interview: CompletedInterview, owner: string) {
  const { id } = interview.session;
  const finishedAt = interviewTime(interview);
  localStorage.setItem(scopedKey(reportStorageKey(id), owner), JSON.stringify(interview));
  const latest = readInterviewStorage<{ id: string; finishedAt: string }>(latestReportKey, owner);
  if (!latest || latest.finishedAt <= finishedAt) {
    localStorage.setItem(scopedKey(latestReportKey, owner), JSON.stringify({ id, finishedAt }));
  }
}

export function archiveCompletedInterview(state: InterviewState | null | undefined) {
  if (!isCompletedInterview(state)) return;
  const owner = localOwner();
  const id = state.session.id;
  if (!readInterviewStorage(reportStorageKey(id), owner)) {
    writeArchive(state, owner);
    markPending(id, owner);
  }
  notifyInterviewStorage();
}

export function readCompletedInterview(id?: string, owner = localOwner()): CompletedInterview | undefined {
  const latest = id ?? readInterviewStorage<{ id: string }>(latestReportKey, owner)?.id;
  const archived = latest ? readInterviewStorage<CompletedInterview>(reportStorageKey(latest), owner) : undefined;
  if (isCompletedInterview(archived) && archived.session.id === latest) return archived;

  const legacy = readInterviewStorage<SavedInterview>(interviewSessionKey, owner)?.state;
  if (isCompletedInterview(legacy) && (id === undefined || legacy.session.id === id)) return legacy;
}

export function readPlan(id: string, owner = localOwner()) {
  const saved = readInterviewStorage<unknown>(planStorageKey(id), owner);
  return Array.isArray(saved) ? saved.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7) as number[] : [];
}

export function savePlan(id: string, checked: number[]) {
  writeInterviewStorage(planStorageKey(id), checked);
  markPending(id);
  notifyInterviewStorage();
}

export function listCompletedInterviews(owner = localOwner()): Archive[] {
  const prefix = scopedKey(reportStorageKey(""), owner);
  const ids = new Set(storedKeys().filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)));
  const legacy = readInterviewStorage<SavedInterview>(interviewSessionKey, owner)?.state;
  if (isCompletedInterview(legacy)) ids.add(legacy.session.id);
  return [...ids].flatMap((id) => {
    const interview = readCompletedInterview(id, owner);
    return interview ? [{ interview, checked: readPlan(id, owner) }] : [];
  }).sort((a, b) => interviewTime(b.interview).localeCompare(interviewTime(a.interview)));
}

export function interviewTime(interview: CompletedInterview) {
  return interview.session.finishedAt ?? interview.session.startedAt;
}

export function pendingArchives(owner: string) {
  return listCompletedInterviews(owner).flatMap((archive) => {
    const id = archive.interview.session.id;
    const revision = localStorage.getItem(scopedKey(pendingKey(id), owner));
    return revision ? [{ archive, id, revision }] : [];
  });
}

export function acknowledgeArchive(owner: string, id: string, revision: string) {
  const key = scopedKey(pendingKey(id), owner);
  if (localStorage.getItem(key) === revision) localStorage.removeItem(key);
}

export function cacheArchive({ interview, checked }: Archive, owner: string) {
  const id = interview.session.id;
  if (localStorage.getItem(scopedKey(pendingKey(id), owner))) return;
  writeArchive(interview, owner);
  localStorage.setItem(scopedKey(planStorageKey(id), owner), JSON.stringify(checked));
}

export function deletionPending(owner: string) {
  return Boolean(owner && localStorage.getItem(deletionKey(owner)));
}

export function clearInterviewData(owner: string) {
  if (owner) localStorage.setItem(deletionKey(owner), "pending");
  const prefix = scopedKey("", owner);
  for (const key of storedKeys()) {
    if (key.startsWith(prefix) && isInterviewKey(key.slice(prefix.length))) localStorage.removeItem(key);
  }
  localStorage.removeItem("zhui-mian:auto-read");
  notifyInterviewStorage();
}

export function acknowledgeDeletion(owner: string) {
  localStorage.removeItem(deletionKey(owner));
  notifyInterviewStorage();
}

export function saveInterview(snapshot: SavedInterview, key = interviewSessionKey) {
  if (key === interviewSessionKey) {
    const previous = readInterviewStorage<SavedInterview>(key)?.state;
    if (previous?.session.id !== snapshot.state?.session.id) archiveCompletedInterview(previous);
  }
  writeInterviewStorage(key, snapshot);
  archiveCompletedInterview(snapshot.state);
}
