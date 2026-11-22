import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "模拟面试｜追面",
  description: "从你的项目经历出发进行追问式模拟面试，逐题获得评分与改进反馈。",
};

export default function InterviewLayout({ children }: { children: ReactNode }) {
  return children;
}
