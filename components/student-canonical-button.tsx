'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { readApiResponse } from '@/lib/api-response';
import type { StudentPreview } from '@/lib/student-canonical-store';

export function StudentCanonicalButton({ questionId, studentId, disabled }: { questionId: number; studentId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [preview, setPreview] = useState<StudentPreview | null>(null);
  const [text, setText] = useState(''), [confirmed, setConfirmed] = useState(false), [error, setError] = useState(''), [canonicalId, setCanonicalId] = useState<string | null>(null);
  async function inspect() {
    setOpen(true); setBusy(true); setError(''); setPreview(null); setConfirmed(false);
    try { const data = await readApiResponse<StudentPreview>(await fetch(`/api/questions/${questionId}/canonical?studentId=${studentId}`, { cache: 'no-store' })); setPreview(data); setText(data.text); setCanonicalId(data.canonicalId); }
    catch (e) { setError(e instanceof Error ? e.message : '读取失败。'); } finally { setBusy(false); }
  }
  async function add() {
    if (!preview) return;
    setBusy(true); setError('');
    try { const data = await readApiResponse<{ canonicalId: string }>(await fetch(`/api/questions/${questionId}/canonical`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: Number(studentId), snapshot: preview.snapshot, text, confirmed }) })); setCanonicalId(data.canonicalId); }
    catch (e) { setError(e instanceof Error ? e.message : '入库失败。'); } finally { setBusy(false); }
  }
  return <><Button variant="outline" disabled={disabled || busy} onClick={() => void inspect()}>加入统一数学题库</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>加入统一数学题库</DialogTitle><DialogDescription>核对原图和完整题干后保存到项目私有题库，供智能备课引用。</DialogDescription></DialogHeader>
      {busy && <p role="status">正在处理…</p>}{error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      {canonicalId ? <div className="space-y-3"><p>此题已加入统一数学题库。</p><Link className="text-terracotta-800 underline" href={`/math-library/${canonicalId}`}>查看统一题库中的题目 →</Link><p className="text-xs text-slate-500">这里保留入库时的版本；后续学生题目修改不会自动覆盖它。</p></div> : preview && <div className="space-y-4">
        <img src={preview.imageUrl} alt="待入库题目原图" className="max-h-72 w-full object-contain" />
        <label className="block text-sm">完整题干（可对照原图纠正）<Textarea aria-label="统一题库完整题干" rows={7} maxLength={20000} disabled={busy} value={text} onChange={e => { setText(e.target.value); setConfirmed(false); }} /></label>
        <p className="text-sm">{preview.classification.education_stage} · {preview.classification.chapter.name} · {preview.classification.knowledge_points.map(p => p.name).join('、')}</p>
        <p className="text-xs text-slate-500">分类使用已保存的教师修改。请先保存页面上的分类修改，再打开此窗口。</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>我已核对题干、条件、公式、选项、小问及必要图形完整，并确认可纳入本人项目私有题库。</span></label>
        <Button disabled={busy || !confirmed || !text.trim()} onClick={() => void add()}>确认并加入统一数学题库</Button>
      </div>}
    </DialogContent></Dialog></>;
}
