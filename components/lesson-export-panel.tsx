"use client";
import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { Button } from './ui/button';
import { readApiResponse } from '@/lib/api-response';
import { createLessonDocx } from '@/lib/lesson-docx';
import { exportFilename, type LessonExportSnapshot } from '@/lib/lesson-export';
import { loadLessonExportImages } from '@/lib/lesson-export-client';

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LessonExportPanel({ id, versionId, revision, dirty, busy }: { id: string; versionId: string; revision: number; dirty: boolean; busy: boolean }) {
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null), last = useRef<'teacher' | 'student' | 'both'>('both');
  useEffect(() => () => controller.current?.abort(), []);
  async function exportWord(audience: 'teacher' | 'student' | 'both') {
    if (dirty || busy || controller.current) return;
    last.current = audience; const abort = new AbortController(); controller.current = abort;
    setRunning(true); setError(''); setNotice('正在读取已保存教案和原始题图…');
    const timer = setTimeout(() => abort.abort('timeout'), 90000);
    try {
      const snapshot = await readApiResponse<LessonExportSnapshot>(await fetch('/api/lesson-plans/' + id + '/export?' + new URLSearchParams({ version: versionId }), { cache: 'no-store', signal: abort.signal }));
      if (snapshot.planId !== id || snapshot.versionId !== versionId || snapshot.revision !== revision) throw Error('保存版本不一致，请重新读取教案后导出。');
      const images = await loadLessonExportImages(snapshot, abort.signal);
      abort.signal.throwIfAborted();
      const docType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (audience === 'both') {
        const teacher = createLessonDocx(snapshot, 'teacher', images), student = createLessonDocx(snapshot, 'student', images);
        download(zipSync({ [exportFilename(snapshot, 'teacher')]: teacher, [exportFilename(snapshot, 'student')]: student }), `教案两版-v${snapshot.revision}.zip`, 'application/zip');
      } else download(createLessonDocx(snapshot, audience, images), exportFilename(snapshot, audience), docType);
      setNotice(`已导出已保存版本 v${snapshot.revision}；学生版隐藏教师讲解和答案。`);
    } catch (e) { setNotice(''); setError(abort.signal.aborted ? abort.signal.reason === 'timeout' ? '导出超时，教案保留，请重试。' : '导出已取消，教案保留。' : e instanceof Error ? e.message : '导出失败，教案保留。'); }
    finally { clearTimeout(timer); if (controller.current === abort) { controller.current = null; setRunning(false); } }
  }
  return <section className="space-y-3 rounded-xl border p-3"><h2 className="font-semibold">Word 教学资料导出</h2><p className="text-xs text-slate-500">固定使用已保存版本 v{revision}。两版共用相同原题与图形，导出不调用 AI。</p>
    {dirty && <p className="text-xs text-amber-800">当前有未保存修改，请先保存，再导出。</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={dirty || busy || running} onClick={() => exportWord('teacher')}>教师版 .docx</Button><Button size="sm" variant="outline" disabled={dirty || busy || running} onClick={() => exportWord('student')}>学生版 .docx</Button><Button size="sm" disabled={dirty || busy || running} onClick={() => exportWord('both')}>下载两版 Word 压缩包</Button></div>
    {running && <Button size="sm" variant="outline" onClick={() => controller.current?.abort()}>取消导出</Button>}
    {notice && <p role="status" className="text-xs">{notice}</p>}
    {error && <div role="alert" className="space-y-2 text-xs text-amber-800"><p>{error}</p><Button size="sm" variant="outline" disabled={dirty || busy || running} onClick={() => exportWord(last.current)}>重试导出</Button></div>}
  </section>;
}
