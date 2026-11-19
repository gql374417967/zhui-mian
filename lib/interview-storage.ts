import type { InterviewState } from "./engine";
import type { ProjectInput } from "./types";

export const interviewInputKey = "zhui-mian:interview-input";
export const interviewSessionKey = "zhui-mian:interview-session";

export type SavedInterview = {
  input: ProjectInput;
  state: InterviewState | null;
  draft: string;
};

export function readInterviewStorage<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}
