import { History } from "lucide-react";
import { SectionShell } from "@/components/section-shell";

export default function HistoryPage() {
  return <SectionShell title="历史记录" description="以往的面试记录将在这里显示。" icon={<History size={24} />} />;
}
