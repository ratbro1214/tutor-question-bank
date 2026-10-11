"use client";
import { useEffect, useRef, useState } from 'react';
import { MathLibraryDetail } from './math-library';
import { MathText } from './math-text';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { readApiResponse } from '@/lib/api-response';
import { chaptersForStage, taxonomyForStage } from '@/lib/taxonomy';
import { defaultSelectionWeights, rankLessonCandidates, type LibraryCandidate } from '@/lib/lesson-question-selection';
import type { LessonContent, LessonPlan } from '@/lib/lesson-plan';

const initial = { q: '', stage: '', chapter: '', knowledge: '', type: '', difficulty: '', paper: '', review: '' };
type Facets = { types: string[]; difficulties: string[]; papers: { id: string; title: string }[] };
export function LessonQuestionPicker({ content, resources, busy, replaceId, cancelReplace, choose }: {
  content: LessonContent; resources: LessonPlan['resources']; busy: boolean; replaceId?: string;
  cancelReplace: () => void; choose: (item: LibraryCandidate, replaceId?: string) => Promise<void>;
}) {
  const [filters, setFilters] = useState({ ...initial, stage: content.stage as string });
  const [facets, setFacets] = useState<Facets | null>(null), [items, setItems] = useState<LibraryCandidate[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState('');
  const [rank, setRank] = useState(true), [weights, setWeights] = useState(defaultSelectionWeights);
  const [target, setTarget] = useState({ knowledge: '', difficulty: '', type: '' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { const abort = new AbortController();
    fetch('/api/math-library/facets', { signal: abort.signal, cache: 'no-store' }).then(readApiResponse<Facets>).then(setFacets).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  function change(key: keyof typeof initial, value: string) {
    controller.current?.abort(); setLoading(false); setItems([]); setSearched(false); setPreview(''); setPage(1);
    setFilters(f => ({ ...f, [key]: value, ...(key === 'stage' ? { chapter: '', knowledge: '' } : key === 'chapter' ? { knowledge: '' } : {}) }));
  }
  async function search(nextPage = 1) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); setItems([]); setPreview(''); setSearched(false);
    try {
      const response = await fetch('/api/math-library?' + new URLSearchParams({ ...filters, page: String(nextPage), pageSize: '20' }), { cache: 'no-store', signal: abort.signal });
      const result = await readApiResponse<{ items: LibraryCandidate[]; total: number }>(response);
      if (!abort.signal.aborted) { setItems(result.items); setTotal(result.total); setPage(nextPage); setSearched(true); }
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  const stages: ('初中' | '高中')[] = filters.stage === '初中' ? ['初中'] : filters.stage === '高中' ? ['高中'] : ['初中', '高中'];
  const points = stages.flatMap(stage => taxonomyForStage(stage).map(k => [k[0], k[1], k[2]] as [string, string, string])).filter(k => k[2] !== 'METHOD' && (!filters.chapter || k[2] === filters.chapter));
  const field = (label: string, key: keyof typeof initial, options: [string, string][]) => <label className="block space-y-1 text-xs">{label}<select aria-label={'选题' + label} className="h-10 w-full rounded-lg border bg-white px-2" value={filters[key]} onChange={e => change(key, e.target.value)}><option value="">全部</option>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const ranked = rankLessonCandidates(items, target, content.questions.map(q => ({ canonicalId: q.canonicalId, text: resources.find(r => r.canonicalId === q.canonicalId && r.revisionId === q.revisionId)?.text || '' })), weights);
  const displayed = rank ? ranked : items.map(item => ({ item, score: 0, reasons: [] }));
  return <div className="space-y-3">
    <p className="text-xs text-slate-500">复用统一题库检索；手动选题和规则推荐均无需调用 AI。</p>
    {replaceId && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm">请选择替换题目，保留原位置、用途和备注。<Button size="sm" variant="ghost" onClick={cancelReplace}>取消替换</Button></p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {field('学段', 'stage', [['初中', '初中'], ['高中', '高中']])}
      {field('章节', 'chapter', stages.flatMap(stage => chaptersForStage(stage).map(([c, n]) => [c, n] as [string, string])))}
      {field('知识点', 'knowledge', points.map(k => [k[0], k[1]]))}
      {field('题型', 'type', (facets?.types || []).map(s => [s, s]))}
      {field('难度', 'difficulty', (facets?.difficulties || []).map(s => [s, s]))}
      {field('来源试卷', 'paper', (facets?.papers || []).map(p => [p.id, p.title]))}
      {field('审核状态', 'review', [['ready', '内容身份就绪'], ['needs_review', '内容身份待复核'], ['incomplete', '内容不完整'], ['classification_review', '分类待复核']])}
    </div>
    <p className="text-xs text-slate-500">上述审核状态不代表解析已审核；解析审核结论见完整预览。</p>
    <Input aria-label="选题关键词" placeholder="题干、关键词（空格分隔）" value={filters.q} onChange={e => change('q', e.target.value)} />
    <Button variant="outline" disabled={loading || busy} onClick={() => search()}>{loading ? '检索中…' : '检索 Canonical 题库'}</Button>
    <details className="space-y-2 rounded-lg border p-3"><summary className="cursor-pointer text-sm">推荐目标及规则权重</summary>
      <p className="text-xs text-slate-500">仅对当前页真实检索结果排序。权重为初始规则配置，未经效果评估，不代表最优算法；质量分只反映身份和题图记录。</p>
      <label className="block text-sm"><input type="checkbox" checked={rank} onChange={e => setRank(e.target.checked)} /> 使用规则排序</label>
      {(['knowledge', 'difficulty', 'type'] as const).map(key => <label key={key} className="block text-xs">推荐目标：{{ knowledge: '知识点', difficulty: '难度', type: '题型' }[key]}<select aria-label={'推荐目标' + key} className="h-10 w-full rounded-lg border" value={target[key]} onChange={e => setTarget(t => ({ ...t, [key]: e.target.value }))}><option value="">未指定</option>{(key === 'knowledge' ? taxonomyForStage(content.stage).filter(k => k[2] !== 'METHOD').map(k => [k[0], k[1]]) : (key === 'difficulty' ? facets?.difficulties || [] : facets?.types || []).map(s => [s, s])).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>)}
      {Object.entries(weights).map(([key, value]) => <label key={key} className="flex items-center justify-between gap-2 text-xs">{{ knowledge: '知识点匹配', difficulty: '难度适配', type: '题型匹配', quality: '记录完整性（每项）', repetition: '重复惩罚' }[key]}<Input className="w-20" aria-label={key + '权重'} type="number" min={0} max={100} value={value} onChange={e => setWeights(w => ({ ...w, [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))} /></label>)}
    </details>
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {searched && !items.length && <p role="status" className="text-sm">题库不足：没有符合当前条件的真实题目。请调整筛选或补充题库。</p>}
    {displayed.map(({ item, score, reasons }) => <article key={item.id} className="space-y-2 rounded-xl border p-3 text-sm">
      <MathText>{item.text}</MathText>
      <p className="text-xs">{item.stage || '学段未标注'} · {item.classification?.question_type || '题型未标注'} · {item.classification?.difficulty || '难度未标注'}</p>
      <p className="text-xs">知识点：{item.classification?.knowledge_points?.map(k => k.name).join('、') || '未标注'}</p>
      <p className="text-xs">来源：{item.sources.map(s => s.title).join('；') || '未记录'}</p>
      {rank && <p className="text-xs text-slate-500">规则分 {score}：{reasons.join('；')}</p>}
      <Button size="sm" variant="outline" onClick={() => setPreview(preview === item.id ? '' : item.id)}>完整预览</Button>
      <Button size="sm" disabled={busy || content.questions.some(q => q.canonicalId === item.id) || (!replaceId && content.questions.length >= 30)} onClick={() => choose(item, replaceId)}>{replaceId ? '替换为此题' : '添加例题'}</Button>
      {preview === item.id && <MathLibraryDetail id={item.id} />}
    </article>)}
    {searched && total > 0 && <div className="flex flex-wrap items-center gap-2 text-xs"><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => search(page - 1)}>上一页</Button><span>{page} / {Math.ceil(total / 20)} 页 · {total} 题</span><Button size="sm" variant="outline" disabled={loading || page * 20 >= total} onClick={() => search(page + 1)}>下一页</Button></div>}
  </div>;
}
