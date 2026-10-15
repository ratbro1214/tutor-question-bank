"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MathLibrary } from './math-library';
import { QuestionLibrary } from './question-library';

export function QuestionBankHub() {
  const archive = usePathname() === '/questions';
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-sm font-medium text-terracotta-800">教学资源</p><h1 className="text-3xl font-semibold">数学题库</h1><p className="mt-3 text-sm leading-6 text-slate-500">查找可复用的教学题目，或从学生归档中整理真实学习问题。</p></div>
      <div className="flex gap-3 text-sm"><Link className="rounded-xl border bg-white px-4 py-2" href="/upload">录入题目</Link><Link className="rounded-xl bg-[var(--primary)] px-4 py-2 text-white" href="/lesson-plans">用题库备课 →</Link></div>
    </header>
    <nav aria-label="题库视图" className="flex gap-2 rounded-2xl bg-muted/70 p-1.5">
      {[['/math-library', '教学题库', '按知识点检索 · 跨来源去重'], ['/questions', '学生归档', '按学生查看 · 整理入库']].map(([href, title, description]) => <Link key={href} href={href} aria-current={(archive ? href === '/questions' : href === '/math-library') ? 'page' : undefined} className={`flex-1 rounded-xl px-4 py-3 ${((href === '/questions') === archive) ? 'bg-white text-terracotta-800 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><b className="block text-sm">{title}</b><span className="mt-1 block text-xs">{description}</span></Link>)}
    </nav>
    {archive ? <QuestionLibrary /> : <MathLibrary />}
  </div>;
}
