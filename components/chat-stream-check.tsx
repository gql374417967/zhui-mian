"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ChatStreamCheck() {
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function checkStream() {
    setReply("");
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "用三句简短的中文介绍 STAR 面试法。" }],
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `请求失败（HTTP ${response.status}）。`);
      }
      if (!response.body) throw new Error("未收到回复流。");

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      let hasReply = false;

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) throw new Error("回复流提前结束，请重试。");
          buffer += value;
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1 && !finished) {
            const [event, data] = buffer.slice(0, boundary).split("\n");
            buffer = buffer.slice(boundary + 2);
            if (event === "event: delta") {
              const { content } = JSON.parse(data.slice(6)) as { content: string };
              hasReply = true;
              setReply((previous) => previous + content);
            } else if (event === "event: error") {
              throw new Error(JSON.parse(data.slice(6)).error);
            } else if (event === "event: done") {
              finished = true;
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }

      if (!hasReply) throw new Error("模型没有返回文本，请重试。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "请求失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <Button type="button" disabled={pending} onClick={checkStream}>
        {pending ? "正在接收回复…" : "验证 AI 流式回复"}
      </Button>
      {reply && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{reply}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <span role="status" className="sr-only">{pending ? "正在接收 AI 回复" : reply && !error ? "AI 回复已完成" : ""}</span>
    </div>
  );
}
