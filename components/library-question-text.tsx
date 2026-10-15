import { MathText } from '@/components/math-text';
import { hasUnreadableQuestionText } from '@/lib/question-text-quality';

export function LibraryQuestionText({ text, preview = false }: { text: string; preview?: boolean }) {
  if (!text) return <p className="text-sm text-slate-500">当前版本没有文字题干，请查看原始题图。</p>;
  if (!hasUnreadableQuestionText(text)) return <MathText className={preview ? 'line-clamp-3 text-sm leading-7' : 'text-sm leading-8'}>{text}</MathText>;
  return <div className="space-y-3">
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">文字提取不完整，请以原始题图为准。</p>
    {!preview && <details className="text-sm text-slate-500"><summary className="cursor-pointer">查看原始提取文本</summary><p className="mt-2">此文本包含无法还原的符号和公式顺序，仅供核对。</p><pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans leading-7">{text}</pre></details>}
  </div>;
}
