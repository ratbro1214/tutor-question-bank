"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenCheck, FilePlus2, Gauge, LibraryBig, FlaskConical, Files, Search, PanelLeftClose, PanelLeftOpen, Languages } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
const navigation = [
 { href: "/", label: "学习工作台", group: "工作台", icon: Gauge, matches: (p: string) => p === "/" || p.startsWith("/students/") },
 { href: "/english", label: "英语学习", group: "学科学习", icon: Languages, matches: (p: string) => p === "/english" || p.startsWith("/english/") },
 { href: "/math-library", label: "数学题库", group: "教学内容", icon: LibraryBig, matches: (p: string) => p === "/math-library" || p.startsWith("/math-library/") || p === "/questions" || p.startsWith("/questions/") },
 { href: "/gaokao", label: "十年高考真题", group: "教学内容", icon: Files, matches: (p: string) => p === "/gaokao" || p.startsWith("/gaokao/") },
 { href: "/knowledge-graph/star-map", label: "数学知识星图", group: "教学内容", icon: LibraryBig, matches: (p: string) => p.startsWith("/knowledge-graph") },
 { href: "/math-methods", label: "解题方法库", group: "教学内容", icon: BookOpenCheck, matches: (p: string) => p.startsWith("/math-methods") },
 { href: "/lesson-plans", label: "AI 智能备课", group: "教学内容", icon: BookOpenCheck, matches: (p: string) => p.startsWith("/lesson-plans") },
 { href: "/upload", label: "题目录入", group: "教学内容", icon: FilePlus2, matches: (p: string) => p === "/upload" },
 { href: "/papers", label: "套卷复习", group: "教学内容", icon: Files, matches: (p: string) => p.startsWith("/papers") },
 { href: "/evaluation", label: "教学评测", group: "洞察", icon: FlaskConical, matches: (p: string) => p === "/evaluation" },
];
export function AppShell({ children }: { children: React.ReactNode }) {
 const pathname = usePathname(), router = useRouter();
 const [collapsed, setCollapsed] = useState(false), [searchOpen, setSearchOpen] = useState(false);
 const [students, setStudents] = useState<{id:number;name:string;grade:string}[]>([]);
 useEffect(() => { const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(v => !v); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
 useEffect(() => { if (!searchOpen) return; const controller = new AbortController(); void fetch("/api/students", {signal:controller.signal}).then(async r => { if (r.ok) { const data = await r.json() as { students?: { id: number; name: string; grade: string }[] }; setStudents(data.students || []); } }).catch(() => {}); return () => controller.abort(); }, [searchOpen]);
 function go(href:string) { setSearchOpen(false); router.push(href); }
 return <div className={cn("min-h-screen bg-[var(--background)] md:grid", collapsed ? "md:grid-cols-[80px_minmax(0,1fr)]" : "md:grid-cols-[236px_minmax(0,1fr)]")}>
 <aside className="border-b border-[var(--border)] bg-white md:sticky md:top-0 md:h-screen md:border-r md:border-b-0"><div className="flex h-full flex-col">
 <Link href="/" aria-label="家教题库学习工作台" className="flex h-24 items-center gap-3 px-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-white"><BookOpenCheck className="size-5" /></span>{!collapsed && <span><b className="block text-base font-semibold">家教题库</b><span className="text-xs text-slate-500">教学与学习工作台</span></span>}</Link>
 <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3 md:block" aria-label="主导航">{navigation.map(({href,label,group,icon:Icon,matches},i) => <div key={href} className="shrink-0">{!collapsed && (i === 0 || navigation[i-1].group !== group) && <p className="mb-2 mt-6 hidden px-3 text-[11px] font-semibold tracking-wider text-slate-400 md:block">{group}</p>}<Link href={href} aria-label={label} title={collapsed ? label : undefined} aria-current={matches(pathname) ? "page" : undefined} className={cn("mb-1 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",collapsed && "justify-center",matches(pathname) ? "bg-[var(--accent)] text-[var(--primary)]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}><Icon className="size-[18px] shrink-0" />{!collapsed && label}</Link></div>)}</nav>
 <div className="mt-auto hidden space-y-4 p-4 md:block">{!collapsed && <div className="rounded-xl bg-[var(--color-brand-primary-soft)] p-4"><p className="text-xs font-semibold text-terracotta-900">让每一道题成为学习线索</p><p className="mt-2 text-xs leading-5 text-slate-500">AI 辅助归类，教师确认；从题目记录走向有依据的教学。</p><Link href="/upload" className="mt-3 block text-xs font-semibold text-terracotta-800">录入一道题 →</Link></div>}<button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? "展开侧栏" : "折叠侧栏"} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100">{collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" />收起导航</>}</button></div></div></aside>
 <div className="min-w-0"><header className="flex h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-white/80 px-4 sm:px-8 lg:px-12"><span className="text-xs text-slate-400">{pathname.startsWith("/english") ? "学科学习" : "教师工作台"} <span className="mx-2">/</span><span className="text-slate-700">{pathname.startsWith("/students/") ? (pathname.includes("/questions/") ? "学习工作台 / 学生档案 / 题目详情" : "学习工作台 / 学生档案") : pathname.startsWith("/questions/") ? "数学题库 / 学生归档 / 题目详情" : navigation.find(i => i.matches(pathname))?.label || "学习档案"}</span></span><button onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs text-slate-500"><Search className="size-4" /><span className="hidden sm:inline">搜索学生或前往功能</span><kbd className="rounded border px-1.5 text-[10px]">Ctrl K</kbd></button></header><main className="px-4 py-8 sm:px-8 lg:px-12 lg:py-10"><div className="mx-auto w-full max-w-[1420px]">{children}</div></main></div>
 <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="搜索与快捷导航" description="搜索学生档案或前往教学功能"><CommandInput placeholder="搜索学生、年级或功能…" /><CommandList><CommandEmpty>没有匹配结果，请换个关键词。</CommandEmpty><CommandGroup heading="快捷导航">{navigation.map(i => <CommandItem key={i.href} value={i.label} onSelect={() => go(i.href)}><i.icon />{i.label}</CommandItem>)}</CommandGroup><CommandGroup heading="学生档案">{students.map(s => <CommandItem key={s.id} value={`${s.name} ${s.grade}`} onSelect={() => go(`/students/${s.id}`)}>{s.name}<span className="ml-auto text-xs text-slate-400">{s.grade}</span></CommandItem>)}</CommandGroup></CommandList></CommandDialog>
 </div>;
}
