"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { deletionPending, localOwner, storageEvent } from "@/lib/interview-storage";
import { accountUser, deleteInterviewData, requestAccountLink } from "@/lib/interview-sync";
import { supabaseConfigured } from "@/lib/supabase";

export default function SettingsPage() {
  const [user, setUser] = useState(accountUser);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"upgrade" | "login">("upgrade");
  const [sending, setSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");

  useEffect(() => {
    const read = () => {
      setUser(accountUser());
      setPending(deletionPending(localOwner()));
    };
    read();
    const result = new URLSearchParams(window.location.search).get("email");
    if (result === "confirmed") setEmailStatus("邮箱已确认，已登录正式账号。");
    if (result === "error") setEmailStatus("无法确认该链接。请在发出请求的浏览器中打开最新邮件链接。");
    if (result) window.history.replaceState(window.history.state, "", "/settings");
    window.addEventListener(storageEvent, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(storageEvent, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setEmailStatus("");
    try {
      const result = await requestAccountLink(email.trim(), mode === "upgrade");
      if (result.error) setEmailStatus(result.error);
      else if (result.status === "upgraded") setEmailStatus("已升级为正式账号，可继续使用已有面试记录。");
      else if (result.status === "confirmation-sent") setEmailStatus("请在当前浏览器打开邮件中的确认链接，完成账号升级。");
      else setEmailStatus("登录链接已发送，请在当前浏览器打开邮件中的链接。");
    } catch {
      setEmailStatus(mode === "upgrade" ? "暂时无法升级账号，请稍后重试。" : "暂时无法发送登录链接，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  async function removeData() {
    setConfirm(false);
    setDeleting(true);
    setDeleteStatus("");
    try {
      const complete = await deleteInterviewData();
      setDeleteStatus(complete ? "已清除数据。" : "本地数据已删除。");
    } catch {
      setDeleteStatus("删除未完成，请重试。");
    } finally {
      setDeleting(false);
    }
  }

  const permanent = user && !user.is_anonymous && user.email_confirmed_at;
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-8 sm:px-8">
    <h1 className="text-2xl font-bold">设置</h1>
    <section className="space-y-3 rounded-xl border border-slate-200 p-5" aria-labelledby="account-heading">
      <h2 id="account-heading" className="font-semibold">账号</h2>
      {permanent ? <p className="break-all text-sm text-slate-700">已登录 {user.email}</p> : <>
        <p className="text-sm text-slate-700">{user?.is_anonymous ? "当前使用匿名账号。" : "当前使用本地数据。"}</p>
        {supabaseConfigured && <form onSubmit={(event) => void sendLink(event)} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="account-email">邮箱</label>
          <input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 w-full max-w-sm rounded-md border border-slate-300 px-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={sending}>{mode === "upgrade" ? sending ? "正在升级…" : "升级为正式账号" : sending ? "正在发送…" : "发送登录链接"}</Button>
            <Button type="button" variant="outline" disabled={sending} onClick={() => { setMode(mode === "upgrade" ? "login" : "upgrade"); setEmailStatus(""); }}>
              {mode === "upgrade" ? "已有邮箱账号" : "返回账号升级"}
            </Button>
          </div>
        </form>}
      </>}
      {emailStatus && <p role="status" className="text-sm text-slate-700">{emailStatus}</p>}
    </section>
    <section id="my-data" className="space-y-3 rounded-xl border border-slate-200 p-5" aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="font-semibold">我的数据</h2>
      <p className="text-sm leading-6 text-slate-700">启用云同步时，系统会为无需填写邮箱的访客创建匿名账号。匿名身份与当前浏览器的会话绑定。清除浏览器站点数据或更换浏览器后，可能无法找回该账号。升级为正式账号会保留已有记录。</p>
      <p className="text-sm leading-6 text-slate-700">已完成的面试会同步到当前账号，包括项目经历、岗位和 JD 分析、面试问答、复盘报告及练习计划勾选。未完成的面试和重练草稿保存在本浏览器。</p>
      <p id="delete-details" className="text-sm leading-6 text-slate-700">点击下方按钮并确认，可删除当前账号的云端面试记录，并清除此浏览器中对应的记录、草稿、待同步数据和朗读设置。离线时，云端删除会在该账号恢复连接后重试。删除不可恢复。</p>
      <Button type="button" variant="destructive" aria-describedby="delete-details" disabled={deleting || pending || confirm} onClick={() => setConfirm(true)}>删除我的全部数据</Button>
      {confirm && <div role="alertdialog" aria-labelledby="confirm-delete-title" aria-describedby="delete-details" className="space-y-3 rounded-lg border border-red-200 p-3">
        <p id="confirm-delete-title" className="text-sm font-semibold">确定永久删除这些数据吗？</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" autoFocus onClick={() => setConfirm(false)}>取消</Button>
          <Button type="button" variant="destructive" onClick={() => void removeData()}>确认删除</Button>
        </div>
      </div>}
      {(deleting || pending || deleteStatus) && <p role="status" className="text-sm text-slate-700">
        {deleting ? "正在删除…" : pending ? "本地数据已删除，云端删除将在该账号恢复连接后重试。" : deleteStatus}
      </p>}
    </section>
  </main>;
}
