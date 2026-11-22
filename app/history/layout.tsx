import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "历史记录｜追面",
  description: "查看已完成的模拟面试记录，回看复盘报告或选择两份报告进行对比。",
};

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return children;
}
