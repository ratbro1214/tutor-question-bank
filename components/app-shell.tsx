"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "学生", icon: Users, active: pathname === "/" || pathname.startsWith("/students/") },
    { href: "/upload", label: "录入题目", icon: Upload, active: pathname === "/upload" },
  ];
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#eef2ff_0,transparent_32%),linear-gradient(#f8fafc,#f8fafc)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm"><BookOpenCheck className="size-5" /></span>
            <span><b className="block text-base leading-5 text-slate-950">家教题库</b><span className="block text-xs text-slate-500">数学提问归档</span></span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="主导航">
            {links.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} className={cn("flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors", active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}><Icon className="size-4" />{label}</Link>)}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
