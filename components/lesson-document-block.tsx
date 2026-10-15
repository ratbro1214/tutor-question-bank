"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, ListPlus, Sparkles } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';

/** Plain text remains the source of truth for revision checks and DOCX exports. */
export function LessonDocumentBlock({ title, value, disabled, onChange, onAssistant, onQuestions }: {
  title: string; value: string; disabled: boolean; onChange: (value: string) => void;
  onAssistant: () => void; onQuestions: () => void;
}) {
  const id = useId(), menuId = useId(), ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const cursor = useRef(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(100, element.scrollHeight)}px`;
  }, [value]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let width = element.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (width === element.clientWidth) return;
      width = element.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.height = 'auto';
        element.style.height = `${Math.max(100, element.scrollHeight)}px`;
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  function execute(action: 'outline' | 'assistant' | 'questions') {
    const position = cursor.current;
    const slash = value.slice(0, position).endsWith('/');
    const start = slash ? position - 1 : position;
    const insertion = action === 'outline' ? '教学目的：\n教学活动：\n课堂追问：\n' : '';
    const next = value.slice(0, start) + insertion + value.slice(position);
    if (next.length > 20000) return;
    if (next !== value) onChange(next);
    setMenu(false);
    if (action === 'assistant') onAssistant();
    else if (action === 'questions') onQuestions();
    else requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
  }
  return <div className="lesson-block relative">
    <div className="flex items-center justify-between gap-3"><label htmlFor={id} className="lesson-block-title">{title}</label><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onAssistant}><Sparkles className="size-3.5" />AI 助手</Button></div>
    <Textarea ref={ref} id={id} aria-label={title} aria-controls={menu ? menuId : undefined} disabled={disabled} value={value} maxLength={20000} className="min-h-24 resize-none font-normal" placeholder={`写下${title}，或输入 / 打开快捷操作…`}
      onChange={event => { cursor.current = event.target.selectionStart; onChange(event.target.value); setMenu(event.target.value.slice(0, cursor.current).endsWith('/')); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setMenu(false); } }}
      onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setMenu(false); }} />
    {menu && !disabled && <div id={menuId} role="group" aria-label={`${title}快捷操作`} className="surface-card relative z-10 space-y-1 p-2">
      <p className="px-3 py-1 text-xs text-slate-500">选择操作，Esc 关闭</p>
      {([{ action: 'assistant', icon: Sparkles, label: '打开 AI 助手', note: '生成或优化教学环节' }, { action: 'questions', icon: BookOpen, label: '从题库选择例题', note: '保留真实题目与版本' }, { action: 'outline', icon: ListPlus, label: '插入教学环节提纲', note: '目的、活动与课堂追问' }] as const).map(({ action, icon: Icon, label, note }) => <button key={action} type="button" onClick={() => execute(action)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-terracotta-50 focus-visible:bg-terracotta-50"><Icon className="size-4 text-terracotta-700" /><span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-slate-500">{note}</span></span></button>)}
    </div>}
  </div>;
}
