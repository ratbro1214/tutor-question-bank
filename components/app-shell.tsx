"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, FilePlus2, Gauge, LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "仪表盘", icon: Gauge, matches: (path: string) => path === "/" },
  { href: "/questions", label: "题目库", icon: LibraryBig, matches: (path: string) => path === "/questions" || path.startsWith("/students/") },
  { href: "/upload", label: "题目录入", icon: FilePlus2, matches: (path: string) => path === "/upload" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex h-full flex-col">
          <Link href="/" className="flex h-20 items-center gap-3 px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/25">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--color-brand-primary)] text-white"><BookOpenCheck className="size-5" /></span>
            <span><b className="block text-base font-semibold leading-5 text-[var(--color-text-primary)]">家教题库</b><span className="block text-xs text-[var(--color-text-secondary)]">教师工作台</span></span>
          </Link>
          <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:overflow-visible md:pb-0" aria-label="主导航">
            {navigation.map(({ href, label, icon: Icon, matches }) => {
              const active = matches(pathname);
              return <Link key={label} href={href} aria-current={active ? "page" : undefined} className={cn("flex h-11 shrink-0 items-center gap-3 rounded-md px-3.5 text-sm font-medium transition-colors duration-150", active ? "bg-[var(--color-brand-primary-soft)] text-[var(--color-brand-primary)]" : "text-[var(--color-text-secondary)] hover:bg-slate-50 hover:text-[var(--color-text-primary)]")}><Icon className="size-[18px]" strokeWidth={active ? 2.25 : 1.8} />{label}</Link>;
            })}
          </nav>
          <div className="mt-auto hidden p-5 md:block"><div className="border-l-2 border-emerald-600 bg-slate-50 p-3 text-xs leading-5 text-[var(--color-text-secondary)]"><b className="block text-sm text-[var(--color-text-primary)]">数学题智能归档</b>AI 给出建议，最终分类由教师确认。</div></div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">{children}</main>
    </div>
  );
}
