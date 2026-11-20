"use client";

import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startInterviewSync } from "@/lib/interview-sync";
import { cn } from "@/lib/utils";

const links = [
  { href: "/interview", label: "模拟面试" },
  { href: "/report", label: "复盘报告" },
  { href: "/history", label: "历史记录" },
  { href: "/settings", label: "设置" },
];

export function SiteHeader() {
  const pathname = usePathname();
  useEffect(startInterviewSync, []);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-col px-5 pt-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:py-2 sm:px-8">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className="inline-flex min-h-11 w-fit items-center gap-2.5 text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-white">
            <MessagesSquare size={19} aria-hidden="true" />
          </span>
          追面
        </Link>
        <nav aria-label="主导航" className="flex flex-wrap gap-1 sm:gap-3">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:px-3",
                pathname === href && "bg-blue-50 text-primary hover:bg-blue-50",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
