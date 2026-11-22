import { createInterviewEngine, NetworkError, type InterviewState } from "./engine";
import {
  clearPendingReport, notifyInterviewStorage, readPendingReport, saveInterview, writePendingReport,
  type SavedInterview,
} from "./interview-storage";

type ReportJob = { status: "running" } | { status: "failed"; message: string } | { status: "done" };

// 任务放在模块级，生成中切换页面不会中断；刷新后由待生成记录恢复。
const jobs = new Map<string, ReportJob>();

export function reportJobState(id: string) {
  return jobs.get(id);
}

export function queueReportGeneration(state: InterviewState, snapshot: SavedInterview, storageKey: string) {
  writePendingReport(state.session.id, { snapshot, state, storageKey });
  notifyInterviewStorage();
}

function startReportGeneration(state: InterviewState, snapshot: SavedInterview, storageKey: string) {
  if (state.phase === "completed") return false;
  const id = state.session.id;
  if (jobs.get(id)?.status === "running") return true;

  jobs.set(id, { status: "running" });
  try {
    writePendingReport(id, { snapshot, state, storageKey });
  } catch {
    jobs.set(id, { status: "failed", message: "浏览器无法保存生成任务，请重试。" });
    notifyInterviewStorage();
    return false;
  }
  notifyInterviewStorage();

  void (async () => {
    try {
      const result = await createInterviewEngine().endInterview(state);
      if (result.phase !== "completed") throw new Error("复盘报告未能完成。");
      saveInterview({ ...snapshot, state: result, draft: "" }, storageKey);
      clearPendingReport(id);
      jobs.set(id, { status: "done" });
    } catch (error) {
      jobs.set(id, {
        status: "failed",
        message: error instanceof NetworkError ? error.message : "复盘报告生成失败，请重试。",
      });
    } finally {
      notifyInterviewStorage();
    }
  })();
  return true;
}

export function resumeReportGeneration(id: string) {
  const pending = readPendingReport(id);
  if (!pending) return false;
  return startReportGeneration(pending.state, pending.snapshot, pending.storageKey);
}
