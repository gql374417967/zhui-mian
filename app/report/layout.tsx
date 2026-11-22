import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "复盘报告｜追面",
  description: "查看模拟面试的五维能力雷达、逐题反馈、7 天提升计划与同题重练对比。",
};

export default function ReportLayout({ children }: { children: ReactNode }) {
  return children;
}
