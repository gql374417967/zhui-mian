import { MessagesSquare } from "lucide-react";
import { SectionShell } from "@/components/section-shell";

export default function InterviewPage() {
  return <SectionShell title="模拟面试" description="面试对话将在这里进行，追问功能将在后续开放。" icon={<MessagesSquare size={24} />} />;
}
