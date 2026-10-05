"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cropRegionSchema, type CropRegion, type QuestionCrop } from "@/lib/paper";
import type { PaperDocument } from "@/lib/pdf-browser";

export function PaperCropEditor({ doc, crop, onApply, onClose }: { doc: PaperDocument; crop: QuestionCrop; onApply: (crop: QuestionCrop) => void; onClose: () => void }) {
  const [number, setNumber] = useState(crop.number), [regions, setRegions] = useState(crop.regions), [active, setActive] = useState(0), [image, setImage] = useState(""), [error, setError] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null), region = regions[active];
  useEffect(() => {
    let disposed = false, url = "";
    void doc.renderPage(region.page).then(canvas => { if (disposed) return; url = canvas.toDataURL("image/jpeg", .85); setImage(url); }).catch(() => setError("页面预览失败，请重试。"));
    return () => { disposed = true; };
  }, [doc, region.page]);
  function update(patch: Partial<CropRegion>) { setRegions(current => current.map((r, i) => i === active ? { ...r, ...patch } : r)); setError(""); }
  function point(event: React.PointerEvent<HTMLDivElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; }
  return <div className="surface-card space-y-4 p-5" aria-label="调整题目裁切">
    <div className="flex items-center justify-between"><h3 className="font-semibold">调整裁切 · 拖动框选完整题目</h3><Button variant="outline" size="sm" onClick={onClose}>关闭</Button></div>
    <div className="flex flex-wrap items-center gap-3"><label>题号 <input aria-label="裁切题号" type="number" min={1} max={200} className="w-20 rounded border p-2" value={number} onChange={e => setNumber(Number(e.target.value))} /></label>
      <label>片段 <select aria-label="当前裁切片段" className="rounded border p-2" value={active} onChange={e => setActive(Number(e.target.value))}>{regions.map((r, i) => <option key={i} value={i}>{i + 1} · 第 {r.page} 页</option>)}</select></label>
      <label>页码 <input aria-label="裁切页码" type="number" min={1} max={doc.pages.length} className="w-20 rounded border p-2" value={region.page} onChange={e => update({ page: Math.max(1, Math.min(doc.pages.length, Number(e.target.value))) })} /></label>
      <Button variant="outline" size="sm" onClick={() => { setRegions(current => [...current, { page: Math.min(doc.pages.length, region.page + 1), x: .02, y: .035, width: .96, height: .3 }]); setActive(regions.length); }}>添加跨页片段</Button>
      {regions.length > 1 && <Button variant="outline" size="sm" onClick={() => { setRegions(current => current.filter((_, i) => i !== active)); setActive(0); }}>删除当前片段</Button>}
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
      <div className="relative mx-auto w-full max-w-[640px] touch-none overflow-hidden rounded-lg border bg-slate-100" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); }} onPointerMove={e => { if (!start.current) return; const end = point(e); update({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.max(.001, Math.abs(end.x - start.current.x)), height: Math.max(.001, Math.abs(end.y - start.current.y)) }); }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt={`第 ${region.page} 页，拖动选择题目范围`} className="block w-full select-none" draggable={false} />}
        <div className="pointer-events-none absolute border-2 border-terracotta-600 bg-terracotta-400/10" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />
      </div>
      <div className="space-y-3"><p className="text-sm leading-6 text-slate-500">把题干、全部选项和图形一起框入。跨页题可添加片段，系统按片段顺序拼接。</p>
        {([['x', '左侧'], ['y', '顶部'], ['width', '宽度'], ['height', '高度']] as const).map(([key, label]) => <label className="flex items-center justify-between text-sm" key={key}>{label}（%）<input aria-label={`裁切${label}百分比`} type="number" min={0} max={100} step={.1} className="w-24 rounded border p-2" value={Number((region[key] * 100).toFixed(1))} onChange={e => update({ [key]: Number(e.target.value) / 100 })} /></label>)}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" onClick={() => { if (!Number.isInteger(number) || number < 1 || number > 200 || regions.some(r => !cropRegionSchema.safeParse(r).success)) { setError("题号或裁切范围无效，请检查边界。"); return; } onApply({ number, regions, text: crop.text }); }}>应用裁切</Button>
      </div>
    </div>
  </div>;
}
