import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "追面｜追问式模拟面试",
  description: "从你的项目经历出发，练习真实面试中的层层追问。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-5 py-2 text-sm text-slate-600 sm:px-8">
            <p>无需邮箱即可开始。启用云同步时，已完成的面试会保存到当前账号。</p>
            <Link href="/settings#my-data" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">了解及删除我的数据</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">隐私与数据说明</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
