"use client";

import { useMemo, useState } from "react";
import { EnglishCorpus } from './english-corpus';
import { EnglishReadingPractice } from './english-reading-practice';
import { EnglishStemVocabulary } from './english-stem-vocabulary';
import { EnglishLanguagePractice } from './english-language-practice';
import { EnglishWriting } from './english-writing';
import { EnglishVocabulary } from './english-vocabulary';
import { EnglishSentencePractice } from './english-sentence-practice';
import {
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Compass,
  Languages,
  Leaf,
  LibraryBig,
  ListChecks,
  Sparkles,
  Waypoints,
} from "lucide-react";

type Module = "reading" | "vocabulary" | "sentence" | "corpus" | "stems" | "cloze" | "grammar" | "writing";

const moduleInfo: Record<Module, { label: string; title: string; description: string }> = {
  writing: { label: "作文真题", title: "先读懂写作任务", description: "查看历年应用文与读后续写真题，保留材料、作答要求和给定开头。" },
  cloze: { label: "完形填空", title: "顺着语篇线索，选出合适的词", description: "通读真题，结合上下文、词义和搭配逐空练习。" },
  grammar: { label: "语法填空", title: "在句子里判断词形与结构", description: "结合提示词与句法关系填写答案，再对照来源词形。" },
  stems: { label: "题干词汇", title: "读懂题目在问什么", description: "提取真题题干关键词，结合语境辨别词义，掌握命题表达。" },
  reading: { label: "阅读精练", title: "读懂语篇，也读出线索", description: "按年份、卷别和篇目练习历年阅读真题，再对照来源答案。" },
  vocabulary: { label: "词汇搭配", title: "在语境里记住词", description: "搜索开源考试词汇，查看音标、词形变化与真题例句，记录复习状态。" },
  sentence: { label: "句子拆解", title: "看清句子如何组织", description: "从真题出发，分层拆解主干与修饰关系，再用理解题检验读法。" },
  corpus: { label: "真题语料", title: "每条语料都能追溯来源", description: "按年份、卷别和题型整理真题，并记录校验状态。" },
};

export function EnglishLearning() {
  const [activeModule, setActiveModule] = useState<Module>("reading");
  const [completedModules, setCompletedModules] = useState<Module[]>([]);

  const sessionProgress = useMemo(() => completedModules.length, [completedModules]);

  function setModuleComplete(module: Module) {
    setCompletedModules((current) => current.includes(module) ? current : [...current, module]);
  }

  function selectModule(module: Module) {
    setActiveModule(module);
    requestAnimationFrame(() => document.getElementById("lesson")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-8 pb-8">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#193a35] px-6 py-8 text-white shadow-[0_20px_56px_rgba(25,58,53,0.14)] sm:px-10 sm:py-10 xl:px-12">
        <div className="absolute -right-16 -top-28 -z-10 size-80 rounded-full border border-white/10" />
        <div className="absolute right-12 top-10 -z-10 size-52 rounded-full border border-white/10" />
        <div className="absolute bottom-0 right-[28%] -z-10 h-40 w-40 rounded-full bg-[#d9a56f]/10 blur-3xl" />
        <div className="grid items-center gap-10 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold tracking-[0.15em] text-[#d9c7a7]">
              <Languages className="size-3.5" /> ENGLISH LEARNING SPACE
            </div>
            <h1 className="max-w-xl font-serif text-[36px] font-medium leading-[1.13] tracking-tight !text-white sm:text-[46px]">让每一篇阅读，<br className="hidden sm:block" />都成为英语学习的起点。</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/70 sm:text-base">从语篇理解出发，顺着上下文积累词汇与搭配，再回到句子结构和主题表达。</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#lesson" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#f1d4ad] px-5 text-sm font-semibold text-[#273b34] transition hover:bg-[#f8e4c7]">继续本次学习 <ArrowRight className="size-4" /></a>
              <button onClick={() => selectModule("corpus")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-white/85 transition hover:bg-white/10"><LibraryBig className="size-4" />查看历年真题</button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/55">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#c8d6ae]" />阅读 · 词汇 · 句法 · 主题</span>
              <span className="inline-flex items-center gap-1.5"><Compass className="size-3.5 text-[#d9c7a7]" />真题已归档：2020–2025 · Ⅰ / Ⅱ卷</span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[380px]">
            <div className="rounded-[24px] border border-white/15 bg-white/[0.08] p-5 backdrop-blur-sm sm:p-6">
              <div className="flex items-start justify-between">
                <div><p className="text-[10px] font-bold tracking-[0.18em] text-[#d9c7a7]">A SMALL DAILY PRACTICE</p><p className="mt-2 font-serif text-2xl">今天，读一篇短文</p></div>
                <span className="grid size-11 place-items-center rounded-2xl bg-[#f1d4ad]/15 text-[#f1d4ad]"><BookOpenText className="size-5" /></span>
              </div>
              <div className="my-6 h-px bg-white/10" />
              <div className="space-y-4">
                {[
                  { number: "01", label: "读语篇 · 找主旨", time: "5 min", icon: BookOpenText },
                  { number: "02", label: "学词汇 · 看搭配", time: "4 min", icon: Languages },
                  { number: "03", label: "拆句子 · 理结构", time: "3 min", icon: Waypoints },
                ].map(({ number, label, time, icon: Icon }) => <div key={number} className="flex items-center gap-3"><span className="font-mono text-[10px] text-white/35">{number}</span><span className="grid size-8 place-items-center rounded-lg bg-white/[0.08] text-[#d9c7a7]"><Icon className="size-4" /></span><span className="flex-1 text-sm text-white/85">{label}</span><span className="text-[11px] text-white/45">{time}</span></div>)}
              </div>
              <div className="mt-6 flex items-center justify-between rounded-xl bg-black/15 px-4 py-3"><span className="text-xs text-white/60">本次学习进度</span><span className="text-xs font-semibold text-[#f1d4ad]">{sessionProgress} / 5 项完成</span></div>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/45">每次完成状态仅用于当前练习过程</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="英语学习模块">
        <ModuleCard icon={<BookOpenText />} index="01" title="阅读精练" subtitle="主旨 · 细节 · 推断" active={activeModule === "reading"} onClick={() => selectModule("reading")} />
        <ModuleCard icon={<Languages />} index="02" title="词汇搭配" subtitle="词义 · 词形 · 语境" active={activeModule === "vocabulary"} onClick={() => selectModule("vocabulary")} />
        <ModuleCard icon={<Waypoints />} index="03" title="句子拆解" subtitle="主干 · 从句 · 逻辑" active={activeModule === "sentence"} onClick={() => selectModule("sentence")} />
        <ModuleCard icon={<LibraryBig />} index="04" title="真题语料" subtitle="年份 · 卷别 · 来源校验" active={activeModule === "corpus"} onClick={() => selectModule("corpus")} />
        <ModuleCard icon={<CircleHelp />} index="05" title="题干词汇" subtitle="提取 · 辨义 · 读题方法" active={activeModule === "stems"} onClick={() => selectModule("stems")} />
        <ModuleCard icon={<ListChecks />} index="06" title="完形填空" subtitle="语境 · 词义 · 搭配" active={activeModule === "cloze"} onClick={() => selectModule("cloze")} />
        <ModuleCard icon={<Waypoints />} index="07" title="语法填空" subtitle="词形 · 句法 · 连接" active={activeModule === "grammar"} onClick={() => selectModule("grammar")} />
        <ModuleCard icon={<BookOpenText />} index="08" title="作文真题" subtitle="应用文 · 读后续写 · 原卷" active={activeModule === "writing"} onClick={() => selectModule("writing")} />
      </section>

      <section id="lesson" className="scroll-mt-6 space-y-5">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="mb-1.5 text-[11px] font-bold tracking-[0.16em] text-terracotta-700">YOUR LEARNING PATH</p><h2 className="text-2xl font-semibold">按自己的节奏，开始学习</h2><p className="mt-1.5 text-sm text-slate-500">选择阅读、完形、语法或作文真题，继续英语学习。</p></div>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#f1eeeb] p-1" role="tablist" aria-label="英语学习环节">
            {(Object.keys(moduleInfo) as Module[]).map((module) => <button key={module} role="tab" aria-selected={activeModule === module} onClick={() => setActiveModule(module)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${activeModule === module ? "bg-white text-[#193a35] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{moduleInfo[module].label}</button>)}
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.8fr)]">
          <div className="surface-card min-h-[480px] p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 text-xs font-semibold text-terracotta-800"><span className="grid size-7 place-items-center rounded-lg bg-terracotta-50"><Sparkles className="size-3.5" /></span>{moduleInfo[activeModule].label}<span className="text-slate-300">/</span><span className="font-normal text-slate-400">{(activeModule === "corpus" || activeModule === "reading" || activeModule === "stems" || activeModule === "cloze" || activeModule === "grammar" || activeModule === "writing") ? "历年高考" : activeModule === "vocabulary" ? "ECDICT 开源词库" : "真题长难句"}</span></div><h3 className="mt-3 text-xl font-semibold sm:text-2xl">{moduleInfo[activeModule].title}</h3><p className="mt-1.5 text-sm text-slate-500">{moduleInfo[activeModule].description}</p></div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ede7df] bg-[#faf8f5] px-2.5 py-1 text-[10px] font-medium text-slate-500"><Clock3 className="size-3" />{(activeModule === "corpus" || activeModule === "reading" || activeModule === "stems" || activeModule === "cloze" || activeModule === "grammar" || activeModule === "writing") ? "2020–2025" : activeModule === "vocabulary" ? "考试词汇" : "2020–2025"}</span>
            </div>
            {activeModule === "reading" && <EnglishReadingPractice onComplete={() => setModuleComplete("reading")} />}
            {activeModule === "vocabulary" && <EnglishVocabulary onComplete={() => setModuleComplete("vocabulary")} />}
            {activeModule === "sentence" && <EnglishSentencePractice onComplete={() => setModuleComplete("sentence")} />}
            {activeModule === "corpus" && <EnglishCorpus />}
            {activeModule === "stems" && <EnglishStemVocabulary />}
            {activeModule === "writing" && <EnglishWriting />}
            {(activeModule === "cloze" || activeModule === "grammar") && <EnglishLanguagePractice key={activeModule} type={activeModule === "cloze" ? "CLOZE" : "GRAMMAR_FILL"} onComplete={() => setModuleComplete(activeModule)} />}
          </div>

          <aside className="space-y-4">
            <div className="surface-card p-5">
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-[#edf3ee] text-[#325d4d]"><ListChecks className="size-4" /></span><h3 className="text-sm font-semibold">本次学习清单</h3></div>
              <div className="mt-4 space-y-1">
                <ProgressItem index="01" title="读懂短文与题目" active={activeModule === "reading"} complete={completedModules.includes("reading")} onClick={() => setActiveModule("reading")} />
                <ProgressItem index="02" title="复习 4 个语境词" active={activeModule === "vocabulary"} complete={completedModules.includes("vocabulary")} onClick={() => setActiveModule("vocabulary")} />
                <ProgressItem index="03" title="拆解一个长句" active={activeModule === "sentence"} complete={completedModules.includes("sentence")} onClick={() => setActiveModule("sentence")} />
                <ProgressItem index="04" title="完成一篇完形填空" active={activeModule === "cloze"} complete={completedModules.includes("cloze")} onClick={() => setActiveModule("cloze")} />
                <ProgressItem index="05" title="完成一篇语法填空" active={activeModule === "grammar"} complete={completedModules.includes("grammar")} onClick={() => setActiveModule("grammar")} />
              </div>
              <div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#66836f] transition-all" style={{ width: `${Math.round(sessionProgress / 5 * 100)}%` }} /></div><span className="text-[11px] tabular-nums text-slate-400">{Math.round(sessionProgress / 5 * 100)}%</span></div>
            </div>
            <div className="rounded-2xl border border-[#e6e8dc] bg-[#f4f4eb] p-5">
              <div className="flex items-center gap-2 text-[#496449]"><Leaf className="size-4" /><p className="text-xs font-bold tracking-wide">内容说明</p></div>
              <p className="mt-3 text-sm font-semibold text-slate-800">真题语料与开源词库</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">阅读、完形、语法与作文使用 2020–2025 年Ⅰ、Ⅱ卷真题。词汇采用 ECDICT 开源词库；长难句原文来自真题，译文与结构说明为教学整理。</p>
            </div>
            <div className="rounded-2xl border border-dashed border-[#ddd2c6] p-5">
              <p className="text-xs font-semibold text-slate-700">后续学习方向</p>
              <div className="mt-3 flex flex-wrap gap-2">{["固定搭配", "写作主题", "听力场景", "跨年词频"].map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-500 ring-1 ring-[#ebe4dc]">{item}</span>)}</div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function ModuleCard({ icon, index, title, subtitle, active, onClick }: { icon: React.ReactNode; index: string; title: string; subtitle: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={active} className={`group flex min-h-[112px] items-center gap-4 rounded-2xl border px-4 py-4 text-left transition ${active ? "border-[#c6d4c8] bg-[#f1f5f0] shadow-[0_4px_18px_rgba(40,70,55,0.06)]" : "border-[var(--border)] bg-white hover:border-[#d8c1ae] hover:bg-[#fffdfb]"}`}>
    <span className={`grid size-11 shrink-0 place-items-center rounded-xl transition ${active ? "bg-[#345b4c] text-white" : "bg-[#f5f1ec] text-terracotta-800 group-hover:bg-terracotta-50"}`}>{icon}</span>
    <span className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-slate-400">{index} / LEARN</span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="mt-1 block text-[11px] text-slate-500">{subtitle}</span></span>
    <ArrowRight className={`size-4 shrink-0 transition ${active ? "text-[#345b4c]" : "text-slate-300 group-hover:translate-x-0.5 group-hover:text-terracotta-700"}`} />
  </button>;
}

function ProgressItem({ index, title, active, complete, onClick }: { index: string; title: string; active: boolean; complete: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition ${active ? "bg-[#f5f6f1]" : "hover:bg-slate-50"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${complete ? "bg-[#64826c] text-white" : "bg-slate-100 text-slate-500"}`}>{complete ? <Check className="size-3" /> : index}</span><span className={`flex-1 text-xs ${complete ? "text-slate-500" : "text-slate-700"}`}>{title}</span>{complete && <CheckCircle2 className="size-3.5 text-[#64826c]" />}</button>;
}
