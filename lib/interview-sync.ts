import type { Session, User } from "@supabase/supabase-js";
import {
  acknowledgeArchive, acknowledgeDeletion, cacheArchive, clearInterviewData, deletionPending,
  interviewTime, isCompletedInterview, localOwner, notifyInterviewStorage, pendingArchives,
  selectLocalOwner, storageEvent, type Archive, type CompletedInterview,
} from "./interview-storage";
import { browserSupabase } from "./supabase";

let user: User | null = null;
let connecting: Promise<User | null> | undefined;
let syncing: Promise<void> | undefined;
let syncRequested = false;

const completedColumns = "id,rounds,report";
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

type ReportPayload = Omit<CompletedInterview, "session"> & {
  session: Omit<CompletedInterview["session"], "rounds" | "userId">;
  checked: number[];
};

function setSession(session: Session | null) {
  user = session?.user ?? null;
  if (user) selectLocalOwner(user.id, true);
  notifyInterviewStorage();
}

export function accountUser() { return user; }

export function ensureSession(): Promise<User | null> {
  const client = browserSupabase();
  if (!client) return Promise.resolve(null);
  if (connecting) return connecting;
  const supabase = client;
  connecting = (async () => {
    async function connect() {
      const { data, error } = await supabase.auth.getSession();
      if (error) return null;
      if (data.session) {
        if (user?.id !== data.session.user.id) setSession(data.session);
        return data.session.user;
      }
      if (localOwner() || !navigator.onLine) return null;
      const result = await supabase.auth.signInAnonymously();
      if (!result.error && result.data.session && user?.id !== result.data.user?.id) setSession(result.data.session);
      return result.error ? null : result.data.user;
    }
    return navigator.locks ? navigator.locks.request("zhui-mian:auth", connect) : connect();
  })().catch(() => null).finally(() => { connecting = undefined; });
  return connecting;
}

function toRow({ interview, checked }: Archive, userId: string) {
  const { session: { rounds, userId: _previousOwner, ...session }, ...details } = interview;
  return {
    id: session.id,
    user_id: userId,
    project_text: session.input.projectText,
    track: session.input.track,
    jd_analysis: session.input.jdAnalysis ?? null,
    rounds,
    report: { ...details, session, checked } satisfies ReportPayload,
    status: "completed",
    created_at: interviewTime(interview),
  };
}

function fromRow(row: { id: string; rounds: unknown; report: unknown }): Archive | undefined {
  if (!row.report || typeof row.report !== "object" || !Array.isArray(row.rounds)) return;
  const { session, checked, ...details } = row.report as ReportPayload;
  if (session?.id !== row.id || typeof session.input?.projectText !== "string" ||
      typeof session.input.track !== "string" || typeof session.startedAt !== "string" || !details.track) return;
  const interview = { ...details, session: { ...session, rounds: row.rounds } };
  try {
    if (isCompletedInterview(interview)) {
      return { interview, checked: Array.isArray(checked) ? checked.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7) : [] };
    }
  } catch {
    // 单条历史数据异常时，继续读取同页其他记录。
  }
}

function cloudLock<T>(owner: string, operation: () => Promise<T>) {
  return navigator.locks ? navigator.locks.request(`zhui-mian:cloud:${owner}`, operation) : operation();
}

async function flushArchives() {
  const client = browserSupabase();
  if (!client || !navigator.onLine) return;
  const active = user ?? await ensureSession();
  if (!active || active.id !== localOwner()) return;
  const owner = active.id;
  await cloudLock(owner, async () => {
    if (owner !== localOwner() || user?.id !== owner) return;
    if (deletionPending(owner)) {
      const verified = await client.auth.getUser();
      if (verified.error || verified.data.user?.id !== owner) return;
      const { error } = await client.from("interviews").delete().eq("user_id", owner);
      if (error) return;
      acknowledgeDeletion(owner);
    }
    for (const { archive, id, revision } of pendingArchives(owner)) {
      if (deletionPending(owner) || owner !== localOwner() || user?.id !== owner) return;
      const { error } = await client.from("interviews").upsert(toRow(archive, owner));
      if (error) {
        console.warn("面试归档上传失败，待下次同步重试", error.code || "unknown");
        return;
      }
      acknowledgeArchive(owner, id, revision);
    }
  });
}

export function syncInterviews() {
  syncRequested = true;
  if (!syncing) {
    syncing = (async () => {
      while (syncRequested) {
        syncRequested = false;
        await flushArchives().catch(() => undefined);
      }
    })().finally(() => { syncing = undefined; });
  }
  return syncing;
}

export async function pullInterviews(id?: string, latestOnly = false) {
  const client = browserSupabase();
  if (!client || !navigator.onLine || (id && !uuid.test(id))) return;
  const active = user ?? await ensureSession();
  if (!active || active.id !== localOwner()) return;
  const owner = active.id;
  try {
    await cloudLock(owner, async () => {
      let cursor: string | undefined;
      do {
        if (deletionPending(owner) || owner !== localOwner() || user?.id !== owner) return;
        const query = client.from("interviews").select(completedColumns).eq("user_id", owner).eq("status", "completed");
        const page = id ? query.eq("id", id).limit(1) : latestOnly ? query.order("created_at", { ascending: false }).limit(1)
          : (cursor ? query.gt("id", cursor) : query).order("id").limit(100);
        const { data, error } = await page;
        if (error || !data?.length || deletionPending(owner) || owner !== localOwner() || user?.id !== owner) return;
        for (const row of data) {
          const archive = fromRow(row);
          if (archive) cacheArchive(archive, owner);
        }
        notifyInterviewStorage();
        cursor = !id && !latestOnly && data.length === 100 ? data.at(-1)?.id : undefined;
      } while (cursor);
    });
  } catch {
    // 本地历史仍可用，云端读取失败时保留现有归档。
  }
}

export function startInterviewSync() {
  const client = browserSupabase();
  if (!client) return;
  const requestSync = () => { void syncInterviews(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key?.includes(":pending:") || event.key?.startsWith("zhui-mian:delete:")) requestSync();
  };
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    try {
      if (event === "INITIAL_SESSION" && !session) return;
      setSession(session);
      setTimeout(requestSync, 0);
    } catch {
      // 浏览器本地存储不可用时，保持账号状态和面试页面独立。
    }
  });
  window.addEventListener("online", requestSync);
  window.addEventListener(storageEvent, requestSync);
  window.addEventListener("storage", onStorage);
  requestSync();
  return () => {
    subscription.unsubscribe();
    window.removeEventListener("online", requestSync);
    window.removeEventListener(storageEvent, requestSync);
    window.removeEventListener("storage", onStorage);
  };
}

export async function requestAccountLink(email: string, upgrade: boolean) {
  const client = browserSupabase();
  if (!client) return { error: "云端账号暂不可用。" };
  const emailRedirectTo = new URL("/auth/callback", window.location.origin).toString();

  if (!upgrade) {
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser: false } });
    return error ? { error: "无法发送登录链接。请检查邮箱地址后重试。" } : { status: "login-sent" as const };
  }

  const active = await ensureSession();
  if (!active?.is_anonymous) return { error: "匿名会话暂不可用，请恢复连接后重试。" };
  const { data, error } = await client.auth.updateUser({ email }, { emailRedirectTo });
  if (error) {
    const taken = ["email_exists", "user_already_exists", "identity_already_exists"].includes(error.code ?? "");
    return { error: taken ? "该邮箱已关联其他账号。请使用新邮箱升级当前匿名账号。" : "暂时无法升级账号。请检查邮箱地址后重试。" };
  }
  return data.user && !data.user.is_anonymous && data.user.email_confirmed_at
    ? { status: "upgraded" as const }
    : { status: "confirmation-sent" as const };
}

export async function deleteInterviewData() {
  const owner = localOwner();
  clearInterviewData(owner);
  if (!owner) return true;
  await syncInterviews();
  return !deletionPending(owner);
}
