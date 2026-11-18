import { ClipboardList } from "lucide-react";
import { SectionShell } from "@/components/section-shell";

export default function ReportPage() {
  return <SectionShell title="复盘报告" description="完成面试后，可以在这里查看逐题反馈和提升计划。" icon={<ClipboardList size={24} />} />;
}
