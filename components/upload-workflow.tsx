"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ImagePlus, LoaderCircle, ScanText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { chapters, chapterName, taxonomy } from "@/lib/taxonomy";
import { questionTypes, type Classification } from "@/lib/classification";

type Student = { id: number; name: string; grade: string };

export function UploadWorkflow() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]); const [studentId, setStudentId] = useState("");
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState("");
  const [ai, setAi] = useState<Classification | null>(null); const [confirmed, setConfirmed] = useState<Classification | null>(null);
  const [analyzing, setAnalyzing] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [mode, setMode] = useState<"live" | "demo" | "">("");
  useEffect(() => { fetch("/api/students", { cache: "no-store" }).then(r => r.json()).then(data => { setStudents(data.students || []); if (data.students?.length) setStudentId(String(data.students[0].id)); }).catch(() => setError("无法读取学生列表。")); }, []);
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const availablePoints = useMemo(() => taxonomy.filter(([, , chapter]) => chapter === confirmed?.chapter.code || chapter === "METHOD"), [confirmed?.chapter.code]);

  async function analyze() {
    if (!file || !studentId) { setError("请先选择学生和题目图片。"); return; }
    setAnalyzing(true); setError(""); setAi(null); setConfirmed(null);
    const form = new FormData(); form.append("image", file);
    const response = await fetch("/api/analyze", { method: "POST", body: form }); const data = await response.json();
    if (!response.ok) setError(data.error || "识别失败"); else { setAi(data.classification); setConfirmed(structuredClone(data.classification)); setMode(data.mode); }
    setAnalyzing(false);
  }

  function patch(values: Partial<Classification>) { setConfirmed(current => current ? { ...current, ...values } : current); }
  function changeChapter(code: string) { if (!confirmed) return; patch({ chapter: { code, name: chapterName(code) }, knowledge_points: confirmed.knowledge_points.filter(point => taxonomy.find(([p]) => p === point.code)?.[2] === code || point.code.startsWith("METHOD-")) }); }
  function togglePoint(code: string, checked: boolean) { if (!confirmed) return; const item = taxonomy.find(([pointCode]) => pointCode === code); if (!item) return; const next = checked ? [...confirmed.knowledge_points.filter(p => p.code !== code), { code: item[0], name: item[1] }] : confirmed.knowledge_points.filter(p => p.code !== code); if (next.length > 4) { setError("一道题最多选择 4 个核心知识点。"); return; } patch({ knowledge_points: next }); }

  async function save() {
    if (!file || !ai || !confirmed || !studentId) return;
    if (!confirmed.extracted_question.trim() || !confirmed.knowledge_points.length) { setError("请确认题目原文并至少选择一个知识点。"); return; }
    setSaving(true); setError("");
    const form = new FormData(); form.append("image", file); form.append("studentId", studentId); form.append("aiClassification", JSON.stringify(ai)); form.append("teacherConfirmedClassification", JSON.stringify({ ...confirmed, needs_review: false, review_reasons: [] }));
    const response = await fetch("/api/questions", { method: "POST", body: form }); const data = await response.json();
    if (!response.ok) { setError(data.error || "保存失败"); setSaving(false); return; }
    router.push(`/students/${studentId}`); router.refresh();
  }

  return <div className="space-y-7">
    <div><p className="mb-2 text-sm font-semibold text-indigo-600">题目录入</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">上传、识别，再由教师确认</h1><p className="mt-3 text-base text-slate-600">AI 结果不会直接覆盖教师结论。确认后的分类将作为题库统计依据。</p></div>
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 font-bold text-indigo-700">1</span><div><h2 className="font-bold text-slate-950">选择学生与图片</h2><p className="text-sm text-slate-500">支持常见图片格式，单张不超过 8 MB</p></div></div>
        <div className="grid gap-5">
          <div className="grid gap-2"><Label htmlFor="student">归档到</Label><NativeSelect id="student" value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full"><NativeSelectOption value="">请选择学生</NativeSelectOption>{students.map(student => <NativeSelectOption key={student.id} value={student.id}>{student.name} · {student.grade}</NativeSelectOption>)}</NativeSelect>{!students.length && <p className="text-sm text-amber-700">请先在学生列表中创建档案。</p>}</div>
          <label className="group relative grid min-h-80 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400 hover:bg-indigo-50/40">
            {preview ? <img src={preview} alt="待识别题目预览" className="h-full max-h-[480px] w-full object-contain p-3" /> : <span className="px-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm"><ImagePlus className="size-6" /></span><b className="mt-4 block text-slate-900">点击选择题目图片</b><span className="mt-1 block text-sm text-slate-500">尽量拍完整、保持文字清晰</span></span>}
            <Input type="file" accept="image/*" className="sr-only" onChange={e => { setFile(e.target.files?.[0] || null); setAi(null); setConfirmed(null); }} />
          </label>
          {file && <p className="truncate text-sm text-slate-500">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          <Button size="lg" onClick={analyze} disabled={!file || !studentId || analyzing} className="bg-indigo-600 hover:bg-indigo-700">{analyzing ? <><LoaderCircle className="animate-spin" />正在识别与分类…</> : <><ScanText />开始 AI 识别</>}</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">2</span><div><h2 className="font-bold text-slate-950">教师确认分类</h2><p className="text-sm text-slate-500">可修改题目原文、章节、知识点、题型和难度</p></div></div>
        {error && <div className="mb-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
        {!confirmed ? <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center"><div><Sparkles className="mx-auto size-9 text-slate-300" /><h3 className="mt-4 font-semibold text-slate-800">识别结果会显示在这里</h3><p className="mt-1 text-sm leading-6 text-slate-500">先选择图片并开始识别，再逐项核对 AI 建议。</p></div></div> : <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Badge className={mode === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{mode === "live" ? "视觉模型已识别" : "演示结果 · 待配置模型"}</Badge><span className="text-sm text-slate-500">置信度 {Math.round(confirmed.confidence * 100)}%</span>{confirmed.needs_review && <Badge variant="outline" className="border-amber-300 text-amber-700">需要核对</Badge>}</div>
          <div className="grid gap-2"><Label htmlFor="questionText">题目原文</Label><Textarea id="questionText" value={confirmed.extracted_question} onChange={e => patch({ extracted_question: e.target.value })} className="min-h-28 leading-6" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>主章节</Label><NativeSelect value={confirmed.chapter.code} onChange={e => changeChapter(e.target.value)} className="w-full">{chapters.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="grid gap-2"><Label>难度</Label><NativeSelect value={confirmed.difficulty} onChange={e => patch({ difficulty: e.target.value as Classification["difficulty"] })} className="w-full">{["基础", "中等", "较难"].map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div></div>
          <div className="grid gap-2"><Label>题型</Label><NativeSelect value={confirmed.question_type} onChange={e => patch({ question_type: e.target.value })} className="w-full">{questionTypes.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div>
          <div><div className="mb-2 flex items-center justify-between"><Label>知识点</Label><span className="text-xs text-slate-500">已选 {confirmed.knowledge_points.length}/4</span></div><div className="grid max-h-48 gap-2 overflow-auto rounded-xl border border-slate-200 p-3">{availablePoints.map(([code, name]) => { const checked = confirmed.knowledge_points.some(p => p.code === code); return <label key={code} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"><Checkbox checked={checked} onCheckedChange={value => togglePoint(code, value === true)} /><span>{name}</span></label>; })}</div></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">分类依据</p><Input value={confirmed.classification_notes} onChange={e => patch({ classification_notes: e.target.value })} className="mt-2 bg-white" /></div>
          <Button size="lg" onClick={save} disabled={saving || !confirmed.knowledge_points.length} className="w-full bg-slate-950 hover:bg-slate-800">{saving ? <><LoaderCircle className="animate-spin" />正在保存…</> : <><Check />确认并存入题库</>}</Button>
        </div>}
      </section>
    </div>
  </div>;
}
