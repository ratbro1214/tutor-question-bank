import { z } from 'zod';
import { cropRegionSchema, type PaperPage, type CropRegion } from './paper';

export const SOLUTION_VERSION = '5B-2-rules-v1';
export const LOCAL_SOLUTION_VERSION = '5B-2-local-v2';
export function cleanOCRPages(pages: PaperPage[]): PaperPage[] {
 return pages.map(p=>({...p,items:p.items.map(i=>({...i,text:i.text.replace(/到公众号.*?(?:备考资料|学习资料)/g,'').trim()})).filter(i=>i.text&&!/HUN\d+|^高三数学[·・•]?\s*答案$/.test(i.text.replace(/\s/g,''))&&!(/^\d+$/.test(i.text)&&i.y/p.height>.95))}));
}
export const solutionPageSchema = z.object({ page: z.number().int().min(1).max(80), width: z.number().positive().max(20000), height: z.number().positive().max(20000),
  items: z.array(z.object({ text: z.string().max(16000), x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().nonnegative(), height: z.number().nonnegative() })).max(20000) });
export const solutionEntrySchema = z.object({ key: z.string().min(1).max(160), number: z.number().int().min(1).max(200).nullable(), section: z.string().max(100),
  text: z.string().trim().min(1).max(60000), regions: z.array(cropRegionSchema).min(1).max(80), answerOnly: z.boolean(), warnings: z.array(z.string().max(300)).max(10) });
export type SolutionEntry = z.infer<typeof solutionEntrySchema>;
export type MatchQuestion = { id: string; number: number; text: string; type?: string; educationStage?:string; revision: number; regions: CropRegion[]; imageKey?:string; updatedAt?:string };
export type MatchProposal = { questionId: string | null; status: 'MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED'; level: 'high' | 'medium' | 'low'; candidates: { questionId: string; reasons: string[] }[]; reasons: string[]; version: string };
const compact = (s: string) => s.normalize('NFKC').replace(/\s/g, '');
const questionKind = (s: string) => /选择/.test(s) ? '选择' : /填空/.test(s) ? '填空' : /解答|证明|计算/.test(s) ? '解答' : '';

// Document boundaries follow explicit headings/numbers. Subparts never start a new parent.
// Source regions extend to the next heading and include page/column continuations and diagrams.
export function splitSolutions(pages: PaperPage[]): SolutionEntry[] {
  const entries: SolutionEntry[] = []; let active: SolutionEntry | null = null, section = '';
  for (const page of pages) {
    const rows: typeof page.items[] = [];
    for (const item of [...page.items].sort((a,b) => a.y-b.y || a.x-b.x)) {
      const row = rows.find(r => Math.abs(r[0].y+r[0].height-item.y-item.height) < Math.max(3,item.height*.35));
      if (row) row.push(item); else rows.push([item]);
    }
    const lines = rows.map(r => ({ text: r.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '), y: Math.min(...r.map(i=>i.y))/page.height, bottom: Math.max(...r.map(i=>i.y+i.height))/page.height }));
    let start = 0;
    const append = (end: number) => { if (active && end-start>.001) active.regions.push({page:page.page,x:0,y:start,width:1,height:end-start}); };
    const tableLines=new Set<number>();
    for (const [lineIndex,line] of lines.entries()) {
      if(tableLines.has(lineIndex))continue;
      const tableNumbers=line.text.trim().match(/^题号\s+((?:\d{1,3}\s*)+)$/),tableAnswers=lines[lineIndex+1]?.text.trim().match(/^答案\s+((?:[A-D]\s*)+)$/);
      if(tableNumbers&&tableAnswers){
        const ns=tableNumbers[1].trim().split(/\s+/).map(Number),as=tableAnswers[1].trim().split(/\s+/);
        if(ns.length===as.length&&ns.length>=2&&ns.every(n=>n>=1&&n<=200)){
          append(line.y);active=null;start=lines[lineIndex+1].bottom;tableLines.add(lineIndex+1);
          ns.forEach((number,j)=>entries.push({key:`table:${page.page}:${lineIndex}:${j}`,number,section,text:as[j],regions:[{page:page.page,x:0,y:line.y,width:1,height:Math.max(.005,lines[lineIndex+1].bottom-line.y)}],answerOnly:true,warnings:[]}));continue;
        }
      }
      if (line.y > .985 || /^(?:第?\s*\d+\s*页|\d+\s*\/\s*\d+)\s*(?:共.*)?$/.test(line.text.trim())) continue;
      const text = compact(line.text);
      if (/^[一二三四五六七八九十]+[、.：:].*(?:题|部分)/.test(text)) { append(line.y); active=null; section=line.text.trim(); start=line.bottom; continue; }
      if (/^(参考答案|答案解析|参考解析|参考答案与解析)$/.test(text)) continue;
      // Numbered inline answer lists, including 1 A 2 B, do not become invented worked solutions.
      const pairs = [...text.matchAll(/(?:^|[，,;；\s])(?:第)?(\d{1,3})(?:题)?[.、:：)）]?([A-D])(?=$|[，,;；\s]|\d)/g)];
      const dense = [...text.matchAll(/(?:第)?(\d{1,3})(?:题)?[.、:：)）]?([A-D])/g)];
      if ((pairs.length>=2 || dense.length>=2) && dense.map(m=>m[0]).join('').replace(/[.、:：)）]/g,'')===text.replace(/[，,;；.、:：)）]/g,'')) {
        append(line.y); active=null;
        for (const m of dense) if (+m[1]>0 && +m[1]<=200) entries.push({key:`row:${page.page}:${line.y}:${m[1]}`,number:+m[1],section,text:m[2],regions:[{page:page.page,x:0,y:line.y,width:1,height:Math.max(.005,line.bottom-line.y)}],answerOnly:true,warnings:[]});
        start=line.bottom; continue;
      }
      const number = line.text.normalize('NFKC').trim().match(/^(?:第\s*(\d{1,3})\s*题|([1-9]\d{0,2})\s*[.、:：](?!\d))/);
      if (number) {
        append(line.y); start=Math.max(0,line.y-.003);
        active={key:`entry:${entries.length}`,number:+(number[1]||number[2]),section,text:line.text,regions:[],answerOnly:false,warnings:[]}; entries.push(active);
        if([...text.matchAll(/(?:第\d+题|\d+[.、:：])/g)].length>1)active.warnings.push('同一行出现多个题号，可能多栏排版；须核对边界，不自动确认。');
      } else if (active) active.text+='\n'+line.text;
      else if (text && !section && !/^(题号|答案|选择题答案|填空题答案)$/.test(text)) {
        // Unnumbered material is retained; never guess its question by document order.
        active={key:`entry:${entries.length}`,number:null,section,text:line.text,regions:[],answerOnly:false,warnings:['未识别明确题号，须人工指定对应题目。']}; start=Math.max(0,line.y-.003);entries.push(active);
      }
    }
    const contentBottom=Math.max(0,...lines.map(l=>l.bottom));
    append(Math.min(.99,contentBottom+.005));
  }
  for (const e of entries) {
    const stripped=compact(e.text).replace(/^(?:第\d+题|\d+[.、:：])/, '').replace(/^(?:答案|【答案】)[:：]?/,'');
    e.answerOnly = e.answerOnly || (/^[A-D]$/.test(stripped) || (stripped.length<120&&!/解析|命题透析|解[：:]|证明|所以|因此|得[：:]|步骤|\(1\)|（1）/.test(stripped)));
    if (/\b\d+\s+[A-D]\b/.test(e.text)&&!e.answerOnly) e.warnings.push('疑似答案表格，需对照原文件核查列关系。');
  }
  return entries.filter(e=>e.regions.length).map(e=>solutionEntrySchema.parse(e));
}

export function proposeMatch(entry: SolutionEntry, questions: MatchQuestion[], entries: SolutionEntry[]): MatchProposal {
  const numbered=questions.filter(q=>q.number===entry.number), reasons=[...entry.warnings];
  const candidates=numbered.map(q=>({questionId:q.id,reasons:['标准化题号一致']}));
  if (!candidates.length) return {questionId:null,status:'UNMATCHED',level:'low',candidates:[],reasons:[...reasons,'无相同题号；未按页码或顺序强行关联。'],version:SOLUTION_VERSION};
  const duplicate=entries.filter(e=>e.number===entry.number).length>1;
  const q=numbered[0], kind=questionKind(entry.section), qkind=questionKind(q.type||'');
  const qparts=[...compact(q.text).matchAll(/[（(]([1-9])[）)]/g)].map(m=>m[1]), eparts=[...compact(entry.text).matchAll(/[（(]([1-9])[）)]/g)].map(m=>m[1]);
  const partConflict=qparts.length>0&&eparts.some(p=>!qparts.includes(p));
  const typeConflict=Boolean(kind&&qkind&&kind!==qkind)||(/^[A-D]$/.test(compact(entry.text))&&qkind==='填空');
  const quoted=entry.text.match(/(?:原题|题干)[：:]([^\n]{8,200})/);
  const textConflict=Boolean(quoted&&!compact(q.text).includes(compact(quoted[1])));
  if(duplicate) reasons.push('解析题号重复：可能分节重新编号、汇总答案与详细解析并存或多种解法。');
  if(typeConflict) reasons.push('题型证据冲突。');
  if(partConflict) reasons.push('小问编号与原题冲突。');
  if(textConflict) reasons.push('解析引用的题干与原题冲突。');
  const insufficient=!q.text.trim()||entry.warnings.length>0||numbered.length!==1;
  if(insufficient) reasons.push('文本或边界依据不足。');
  const supported=Boolean(kind&&qkind&&kind===qkind)||Boolean(quoted&&!textConflict)||Boolean(qkind==='解答'&&/解[：:]|证明|因此|所以/.test(entry.text))||Boolean(qkind==='选择'&&entry.answerOnly&&/^[A-D]$/.test(compact(entry.text)));
  if(!supported)reasons.push('只有题号依据，缺少独立题型或题干校验，保留人工确认。');
  const uncertain=duplicate||typeConflict||partConflict||textConflict||insufficient||!supported;
  reasons.push('编号是匹配依据，并非数学正确性证明；等级未经概率校准。');
  return {questionId:uncertain?null:q.id,status:uncertain?'NEEDS_REVIEW':'MATCHED',level:uncertain?(!supported&&!insufficient&&!duplicate&&!typeConflict&&!partConflict&&!textConflict?'medium':'low'):'high',candidates,reasons,version:SOLUTION_VERSION};
}

const text=z.string().max(12000);
const method=z.object({model:text,features:z.array(text).max(12),steps:z.array(text).max(15),conditions:z.array(text).min(1).max(12),mistakes:z.array(text).max(12),variants:z.array(text).max(12)}).strict();
export const solutionQualitySchema=z.object({verdict:z.enum(['no_obvious_error','suspicious','error_detected','insufficient']),summary:text,
  issues:z.array(z.object({excerpt:text,reason:text,correction:text}).strict()).max(20),originalIdea:text,strengths:z.array(text).max(12),limitations:z.array(text).max(12)}).strict();
export const solutionMethodsSchema=z.object({alternatives:z.array(z.object({idea:text,steps:z.array(text).min(1).max(20),conditions:text,comparison:text}).strict()).max(3),
  recommendation:z.enum(['keep_original','consider_alternative','keep_both','teacher_check']),reason:text,method:method.nullable()}).strict();
export const solutionReviewSchema=z.object({quality:solutionQualitySchema,methods:solutionMethodsSchema.nullable()}).strict();
export type SolutionReview=z.infer<typeof solutionReviewSchema>;
