"use client";
import { useEffect, useRef, useState } from 'react';
import { Crop, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PaperCropEditor } from '@/components/paper-crop-editor';
import { openPaperDocument, cropQuestionImage, type PaperDocument } from '@/lib/pdf-browser';
import type { QuestionCrop } from '@/lib/paper';

export function QuestionRecrop({ questionId, disabled, onSaved }: { questionId: number; disabled?: boolean; onSaved: (url: string) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [doc, setDoc] = useState<PaperDocument | null>(null), [crop, setCrop] = useState<QuestionCrop | null>(null);
  const [preview, setPreview] = useState(''), [image, setImage] = useState<Blob | null>(null), [expected, setExpected] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    if (!open) return;
    const version = ++generation.current, controller = new AbortController();
    let document: PaperDocument | null = null;
    setBusy(true); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/questions/${questionId}/crop`, { signal: controller.signal });
        const data = await response.json() as { error?: string; sourceUrl: string; number: number; regions: QuestionCrop['regions']; expectedImageKey: string }; if (!response.ok) throw new Error(data.error || '原图加载失败。');
        const file = await fetch(data.sourceUrl, { signal: controller.signal }); if (!file.ok) throw new Error('原图无法读取，请稍后重试。');
        document = await openPaperDocument(await file.blob());
        if (generation.current !== version) { await document.destroy(); document = null; return; }
        // Start a replacement crop, rather than carrying old fragments into the new image.
        // Additional fragments are only included when the teacher explicitly adds them.
        const primary = data.regions.reduce((largest, region) => region.width * region.height > largest.width * largest.height ? region : largest, data.regions[0] || { page: 1, x: 0, y: 0, width: 1, height: 1 });
        setDoc(document); setCrop({ number: data.number, regions: [primary], text: '' }); setExpected(data.expectedImageKey);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '原图加载失败。'); }
      finally { if (generation.current === version) setBusy(false); }
    })();
    return () => { generation.current++; controller.abort(); if (document) void document.destroy(); setDoc(null); setCrop(null); setImage(null); setPreview(''); };
  }, [open, questionId]);
  useEffect(() => { if (!image) { setPreview(''); return; } const url = URL.createObjectURL(image); setPreview(url); return () => URL.revokeObjectURL(url); }, [image]);
  async function apply(next: QuestionCrop) {
    if (!doc || busy) return;
    const version = generation.current; setBusy(true); setError('');
    try { const blob = await cropQuestionImage(doc, next.regions); if (version === generation.current) { setCrop(next); setImage(blob); } }
    catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : '裁剪失败。'); }
    finally { if (version === generation.current) setBusy(false); }
  }
  async function save() {
    if (!image || busy) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('image', new File([image], 'question.jpg', { type: 'image/jpeg' })); form.set('expectedImageKey', expected);
      const response = await fetch(`/api/questions/${questionId}/crop`, { method: 'POST', body: form });
      const data = await response.json() as { error?: string; imageUrl: string }; if (!response.ok) throw new Error(data.error || '保存失败。');
      onSaved(data.imageUrl); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败。'); }
    finally { setBusy(false); }
  }
  return <><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}><Crop />重新裁剪</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>重新裁剪题目</DialogTitle><DialogDescription>拖动框选完整题目，预览后保存。来自套卷的题目可切换页码，重新从原卷选取。</DialogDescription></DialogHeader>
      {busy && <p className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />正在处理…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {doc && crop && !image && <fieldset disabled={busy}><PaperCropEditor doc={doc} crop={crop} onApply={next => void apply(next)} onClose={() => setOpen(false)} lockNumber /></fieldset>}
      {preview && <div className="space-y-4"><img src={preview} alt="重新裁剪预览" className="max-h-[60vh] w-full object-contain" /><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setImage(null)}>继续调整</Button><Button disabled={busy} onClick={() => void save()}>保存裁剪</Button></div></div>}
    </DialogContent></Dialog>
  </>;
}
