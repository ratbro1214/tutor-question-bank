export function EnglishSourceCrops({ payload }: { payload?: string | null }) {
  if (!payload) return null;
  const crops = JSON.parse(payload) as { path: string; caption: string }[];
  if (!crops.length) return null;
  return <details className="rounded-xl border p-4">
    <summary className="cursor-pointer text-sm text-slate-600">查看本篇原题切图</summary>
    <div className="mt-4 space-y-4">{crops.map(crop => <figure key={crop.path}>
      <a href={crop.path} target="_blank" rel="noreferrer"><img src={crop.path} alt={crop.caption} loading="lazy" className="h-auto w-full rounded-lg border" /></a>
      <figcaption className="mt-2 text-xs text-slate-500">{crop.caption} · 点击放大</figcaption>
    </figure>)}</div>
  </details>;
}
