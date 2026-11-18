import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/project-form";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-20">
      <div className="grid items-start gap-9 md:grid-cols-[1fr_1fr] lg:gap-16">
        <section className="max-w-xl md:pt-6" aria-labelledby="hero-title">
          <p className="text-sm font-semibold text-primary">追问式模拟面试</p>
          <h1 id="hero-title" className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
            别让<span className="text-primary">「我负责了」</span>毁掉你的项目经历
          </h1>
          <p className="mt-5 max-w-sm leading-7 text-slate-600">
            从你的项目经历出发，练习面试里的层层追问，把你的贡献、决策和结果讲清楚。
          </p>
          <Button asChild className="mt-6 w-full sm:w-auto">
            <Link href="/interview">
              <Sparkles size={16} aria-hidden="true" />
              用示例项目 30 秒体验
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </section>
        <ProjectForm />
      </div>
    </main>
  );
}
