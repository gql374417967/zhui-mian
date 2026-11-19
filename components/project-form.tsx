"use client";

import { ArrowRight, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { interviewInputKey } from "@/lib/interview-storage";
import type { ProjectInput } from "@/lib/types";

const tracks = ["后端开发", "前端开发", "算法", "产品", "运营", "数据", "通用"];
const fieldClassName = "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function ProjectForm() {
  const router = useRouter();
  const [notice, setNotice] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const experience = event.currentTarget.elements.namedItem("experience") as HTMLTextAreaElement;
    if (!experience.value.trim()) {
      experience.setCustomValidity("请填写你的项目经历。");
      experience.reportValidity();
      return;
    }
    const input: ProjectInput = {
      projectText: experience.value.trim(),
      track: String(new FormData(event.currentTarget).get("track")),
      source: "paste",
    };
    try {
      localStorage.setItem(interviewInputKey, JSON.stringify(input));
    } catch {
      setNotice("浏览器无法保存项目经历，请允许此站点使用本地存储后重试。");
      return;
    }
    router.push("/interview?start=1");
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0 rounded-2xl border border-border p-5 shadow-sm sm:p-6" aria-labelledby="setup-title">
      <h2 id="setup-title" className="text-xl font-bold">准备面试</h2>
      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="block text-sm font-medium">项目经历</span>
          <textarea
            name="experience"
            required
            rows={5}
            onChange={(event) => event.currentTarget.setCustomValidity("")}
            className={`${fieldClassName} block resize-y`}
            placeholder="粘贴一段项目经历，写下你做了什么、怎么做，以及最后的结果。"
          />
        </label>
        <label className="block space-y-2">
          <span className="block text-sm font-medium">目标岗位</span>
          <select name="track" defaultValue="后端开发" className={`${fieldClassName} min-h-11`}>
            {tracks.map((track) => <option key={track}>{track}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-5 grid gap-2 min-[390px]:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => setNotice("简历上传将在后续开放。现在可以粘贴项目经历。")}>
          <Upload size={16} aria-hidden="true" />
          上传简历
        </Button>
        <Button type="submit">
          开始面试
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <div role="status" className="text-sm leading-6 text-slate-600">
        {notice && <p className="mt-3">{notice}</p>}
      </div>
    </form>
  );
}
