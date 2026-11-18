import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type SectionShellProps = {
  title: string;
  description: string;
  icon: ReactNode;
  children?: ReactNode;
};

export function SectionShell({ title, description, icon, children }: SectionShellProps) {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <section aria-labelledby="page-title" className="max-w-xl rounded-2xl border border-border p-6 sm:p-10">
        <div className="grid size-12 place-items-center rounded-xl bg-blue-50 text-primary" aria-hidden="true">{icon}</div>
        <h1 id="page-title" className="mt-5 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 leading-7 text-slate-600">{description}</p>
        {children}
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">返回首页</Link>
        </Button>
      </section>
    </main>
  );
}
