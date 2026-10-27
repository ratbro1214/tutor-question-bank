'use client';
import { useState } from 'react';
import { conditionInputSchema, type ConditionInput, type ConditionVerification } from '@/lib/method-condition-verification';

export function MethodConditionForm({ onChange }: { onChange: (input: ConditionInput | undefined, invalid: boolean) => void }) {
  const [kind, setKind] = useState('none');
  function changed(form: HTMLFormElement) {
    const data = new FormData(form), selected = String(data.get('kind'));
    if (selected === 'none') { onChange(undefined, false); return; }
    const readNumber = (key: string) => data.get(key) === '' ? NaN : Number(data.get(key));
    const raw = { kind: selected, excerpt: data.get('excerpt'), confirmed: data.get('confirmed') === 'on',
      interval: { left: readNumber('left'), right: readNumber('right'), leftClosed: data.get('leftClosed') === 'on', rightClosed: data.get('rightClosed') === 'on' },
      ...(selected === 'parameter-quadratic' ? { u: readNumber('u'), v: readNumber('v'), w: readNumber('w'), quantifier: data.get('quantifier'), direction: data.get('direction'), strict: data.get('strict') === 'on' } : { p: readNumber('p'), q: readNumber('q') }) };
    const result = conditionInputSchema.safeParse(raw);
    onChange(result.success ? result.data : undefined, !result.success);
  }
  const numeric = (name: string, label: string, defaultValue?: number) => <label className="text-sm" key={name}>{label}<input className="mt-1 w-full rounded border p-2" name={name} type="number" step="any" min={-1e6} max={1e6} required defaultValue={defaultValue} /></label>;
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">两个专题的标准式条件核验</summary>
    <p className="my-3 text-sm text-slate-600">先将本题等价整理为下面一种标准式，再录入系数和有限区间。计算只针对录入标准式，原题变形仍需教师核对。</p>
    <form className="space-y-3" onSubmit={e => e.preventDefault()} onChange={e => changed(e.currentTarget)}>
      <label className="block text-sm">核验类型<select name="kind" className="ml-2 rounded border p-2" value={kind} onChange={e => { setKind(e.target.value); onChange(undefined, e.target.value !== 'none'); }}>
        <option value="none">暂不使用</option><option value="parameter-quadratic">参数约束 a 与 u·x²+v·x+w 比较</option><option value="positive-reciprocal">基本不等式 p·x+q/x（p、q&gt;0）</option>
      </select></label>
      {kind !== 'none' && <div key={kind} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">{kind === 'parameter-quadratic' ? [numeric('u', '二次项系数 u'), numeric('v', '一次项系数 v'), numeric('w', '常数 w')] : [numeric('p', '正系数 p'), numeric('q', '正系数 q')]}
          {numeric('left', '区间左端点')}{numeric('right', '区间右端点')}</div>
        <div className="flex flex-wrap gap-4 text-sm"><label><input name="leftClosed" type="checkbox" /> 包含左端点</label><label><input name="rightClosed" type="checkbox" /> 包含右端点</label></div>
        {kind === 'parameter-quadratic' && <div className="flex flex-wrap gap-3 text-sm"><label>量词 <select name="quantifier" className="rounded border p-2"><option value="all">对所有 x</option><option value="exists">存在 x</option></select></label><label>方向 <select name="direction" className="rounded border p-2"><option value="upper">a ≤ g(x)</option><option value="lower">a ≥ g(x)</option></select></label><label><input name="strict" type="checkbox" /> 严格不等式（&lt; 或 &gt;）</label></div>}
        <label className="block text-sm">逐字引用本题中相关条件（至少四个字符）<textarea name="excerpt" className="mt-1 w-full rounded border p-2" required minLength={4} maxLength={2000} /></label>
        <label className="block text-sm"><input name="confirmed" type="checkbox" /> 已核对标准式、系数、区间与原题等价；未确认时仅保留待核对状态。</label>
      </div>}
    </form>
  </details>;
}

export function MethodConditionResult({ result }: { result: ConditionVerification }) {
  return <section className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3" aria-label="标准式核验结果">
    <h3 className="font-semibold">条件核验 · {result.status === 'verified' ? '标准式已计算' : result.status === 'unsupported' ? '超出核验范围' : '待核对'}</h3>
    <p className="text-sm">{result.summary}</p><ol className="list-decimal space-y-1 pl-5 text-sm">{result.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
  </section>;
}
