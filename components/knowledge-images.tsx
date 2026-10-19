/* eslint-disable @next/next/no-img-element -- Preserve original textbook images without an image transformation service. */
"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, Search, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

type KnowledgeImage = {
 id: string; path: string; sourceUrl: string; url: string;
 titles: string[]; books: string[]; nodeIds: string[]; pages: string[]; kinds: string[];
};
type Catalog = { source: string; licenseStatus: string; images: KnowledgeImage[] };
const pageSize = 24;
export function KnowledgeImages() {
 const [catalog, setCatalog] = useState<Catalog | null>(null);
 const [error, setError] = useState(false);
 const [query, setQuery] = useState(''), [book, setBook] = useState(''), [kind, setKind] = useState('');
 const [page, setPage] = useState(1), [selected, setSelected] = useState<KnowledgeImage | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  fetch('/math-network/catalog.json', {signal: controller.signal}).then(async r => {
   if (!r.ok) throw new Error('catalog');
   setCatalog(await r.json() as Catalog);
  }).catch(e => {if (e.name !== 'AbortError') setError(true);});
  return () => controller.abort();
 }, []);
 useEffect(() => {
  if (!selected) return;
  const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
  const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
  window.addEventListener('keydown', close);
  const dialog = document.getElementById('knowledge-image-dialog') as HTMLDialogElement | null;
  dialog?.showModal();
  return () => { document.body.style.overflow = old; window.removeEventListener('keydown', close); dialog?.close(); };
 }, [selected]);
 const books = useMemo(() => [...new Set(catalog?.images.flatMap(i => i.books) || [])].sort(), [catalog]);
 const filtered = useMemo(() => {
  const q = query.trim().toLocaleLowerCase();
  return (catalog?.images || []).filter(i => (!book || i.books.includes(book)) && (!kind || i.kinds.includes(kind)) && (!q || [...i.titles, ...i.books, ...i.nodeIds, i.path].join(' ').toLocaleLowerCase().includes(q)));
 }, [catalog, query, book, kind]);
 const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
 const current = Math.min(page, pages);
 const reset = () => setPage(1);
 return <section className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-slate-500">教学内容 / 素材参考</p><h1 className="mt-2 text-3xl font-semibold">知识图片</h1><p className="mt-3 text-sm text-slate-500">按知识点查找教材原页与教学插图，点击图片放大阅读。</p></div><Link href="/knowledge-network" className="rounded-xl border bg-white px-4 py-2 text-sm">打开交互知识网络</Link></div>
  <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4"><label className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border px-3"><Search className="size-4 text-slate-400"/><input aria-label="搜索知识图片" className="min-w-0 flex-1 bg-transparent py-3 outline-none" value={query} placeholder="搜索知识点、章节或方法…" onChange={e => {setQuery(e.target.value);reset();}} /></label><select aria-label="教材或来源" className="max-w-full rounded-xl border px-3 py-2" value={book} onChange={e => {setBook(e.target.value);reset();}}><option value="">全部教材与来源</option>{books.map(b => <option key={b}>{b}</option>)}</select><select aria-label="图片类型" className="rounded-xl border px-3 py-2" value={kind} onChange={e => {setKind(e.target.value);reset();}}><option value="">全部图片</option><option value="textbook">教材原页</option><option value="illustration">教学插图与资料页</option></select></div>
  <p role="status" className="text-sm text-slate-500">{error ? '图片目录加载失败，请刷新重试。' : !catalog ? '正在加载图片目录…' : `找到 ${filtered.length} 张图片 · 第 ${current} / ${pages} 页`}</p>
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{filtered.slice((current-1)*pageSize, current*pageSize).map(i => <button key={i.id} onClick={() => setSelected(i)} className="overflow-hidden rounded-2xl border bg-white text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><div className="flex h-52 items-center justify-center bg-slate-50 p-3"><img src={i.url} alt={i.titles[0] || '数学知识图片'} loading="lazy" className="max-h-full max-w-full object-contain" /></div><div className="space-y-2 p-4"><h2 className="line-clamp-2 text-sm font-semibold">{i.titles[0] || '数学资料'}</h2><p className="line-clamp-1 text-xs text-slate-500">{i.books.join('、') || '教学资料'}{i.pages.length ? ` · 第 ${i.pages.join('、')} 页` : ''}</p><p className="line-clamp-2 text-xs leading-5 text-slate-400">{i.titles.slice(1,4).join(' · ')}</p></div></button>)}</div>
  {catalog && filtered.length === 0 && <p className="rounded-xl border border-dashed p-12 text-center text-slate-500">没有匹配的图片，试试更短的关键词或清除筛选。</p>}
  <div className="flex items-center justify-center gap-4"><button aria-label="上一页" disabled={current <= 1} onClick={() => setPage(current-1)} className="rounded-xl border bg-white p-2 disabled:opacity-30"><ChevronLeft /></button><span className="text-sm text-slate-500">{current} / {pages}</span><button aria-label="下一页" disabled={current >= pages} onClick={() => setPage(current+1)} className="rounded-xl border bg-white p-2 disabled:opacity-30"><ChevronRight /></button></div>
  <p className="text-xs leading-6 text-slate-400">图片来源：<a href="https://math-network.yisigeekchalk.com/" target="_blank" rel="noreferrer" className="underline">高中数学知识网络</a>。保留原始出处与知识点对应关系。{catalog?.licenseStatus}</p>
  {selected && <dialog id="knowledge-image-dialog" aria-labelledby="knowledge-image-title" onCancel={() => setSelected(null)} onClick={e => {if(e.target === e.currentTarget) setSelected(null);}} className="fixed inset-0 m-auto max-h-[94vh] w-[min(1100px,94vw)] max-w-none rounded-2xl border bg-white p-0 backdrop:bg-black/70"><div className="sticky top-0 flex items-center justify-between gap-3 border-b bg-white p-4"><h2 id="knowledge-image-title" className="font-semibold">{selected.titles[0] || '知识图片'}</h2><button autoFocus aria-label="关闭图片" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X /></button></div><div className="p-4"><img src={selected.url} alt={selected.titles.join('、')} className="mx-auto h-auto max-w-full"/><p className="mt-4 text-sm leading-7 text-slate-600">关联内容：{selected.titles.join(' · ')}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-blue-700">查看来源原图<ExternalLink className="size-4" /></a></div></dialog>}
 </section>;
}
