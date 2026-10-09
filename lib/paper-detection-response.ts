import { z } from 'zod';
import type { DetectionRow } from './paper-detection';

const rowId=z.number().int().nonnegative();
const schema=z.object({
 anchors:z.array(z.object({row:rowId,column:z.enum(['left','right']).default('left'),number:z.number().int().min(1).max(200)}).strict()).max(100),
 excluded:z.array(z.object({row:rowId,lastRow:rowId.optional(),kind:z.enum(['section','footer'])}).strict()).max(40).default([]),
 isAnswerPage:z.boolean().default(false),
}).strict();

export function readPaperDetection(text:string,rows:DetectionRow[],width:number,pageHeight:number) {
 const detected=schema.parse(JSON.parse(text.trim()));
 const row=(id:number)=>{const value=rows.find(r=>r.id===id);if(!value)throw Error(`模型引用了不存在的行 R${id}，请重新定位。`);return value;};
 return {
  anchors:detected.anchors.map(p=>({number:p.number,x:p.column==='right'?.52:row(p.row).x/width,y:row(p.row).top/pageHeight})),
  excluded:detected.excluded.map(p=>{
   // Only the starting row is needed to stop a crop before a heading.
   // A model may omit lastRow for a single-line heading or footer.
   const first=row(p.row),last=row(p.lastRow??p.row);
   if(last.bottom<first.top)throw Error('模型返回的分节范围倒置，请重新定位。');
   return {x:first.x/width,y:first.top/pageHeight,bottom:last.bottom/pageHeight,kind:p.kind};
  }),
  isAnswerPage:detected.isAnswerPage,
 };
}
