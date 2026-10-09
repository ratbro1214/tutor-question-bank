import { z } from "zod";

export const cropRegionSchema = z.object({ page: z.number().int().min(1).max(80), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).refine(r => r.x + r.width <= 1.001 && r.y + r.height <= 1.001, "裁切范围超出页面。");
export type CropRegion = z.infer<typeof cropRegionSchema>;
export type QuestionCrop = { number: number; regions: CropRegion[]; text: string };
export type PaperTextItem = { text: string; x: number; y: number; width: number; height: number };
export type PaperPage = { page: number; width: number; height: number; items: PaperTextItem[] };
export type QuestionAnchor = { page: number; number: number; x: number; y: number };
export type PaperExcludedBlock = { page: number; x: number; y: number; bottom: number; kind: 'section' | 'footer' };
export type PaperSummary = { id: string; title: string; originalFilename: string; sourceUrl: string; sourceType: string; createdAt: string; questionCount: number; completedCount: number };
export type PaperQuestion = { id: string; number: number; revision: number; imageUrl: string; regions: CropRegion[]; questionText: string; classification: import("./classification").Classification | null; explanation: import("./question-explanation").SavedExplanation | null; status: string; error: string; updatedAt: string };

export function parseQuestionSelection(value: string, available: number[]) {
  if (!value.trim()) return [...available];
  const selected = new Set<number>();
  for (const part of value.replace(/[，、；;]/g, ",").split(",")) {
    const match = part.trim().match(/^(\d{1,3})(?:\s*[-—~～至]\s*(\d{1,3}))?$/);
    if (!match) throw new Error("题号请填写为 1,3,7-10 这样的格式。");
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > 200) throw new Error("题号范围无效，请检查起止题号。");
    for (let i = first; i <= last; i++) selected.add(i);
  }
  const missing = [...selected].filter(n => !available.includes(n));
  if (missing.length) throw new Error(`尚未定位到题号 ${missing.join("、")}，请先检查裁切或手动添加。`);
  return available.filter(n => selected.has(n));
}

export function locateQuestionAnchors(pages: PaperPage[]): QuestionAnchor[] {
  const anchors: QuestionAnchor[] = [];
  for (const page of pages) {
    const lines: PaperTextItem[][] = [];
    for (const item of [...page.items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      // Mixed math fonts have different top edges but share a baseline. Group
      // by baseline so a separate "19" and "．题干" stay on the same line.
      const line = lines.find(line => Math.abs(line[0].y + line[0].height - item.y - item.height) < Math.max(3, item.height * .35));
      if (line) line.push(item); else lines.push([item]);
    }
    for (const line of lines) {
      const ordered = line.sort((a, b) => a.x - b.x);
      // Treat separated columns as different lines, even at the same baseline.
      const groups: PaperTextItem[][] = [];
      for (const item of ordered) {
        const group = groups.at(-1), previous = group?.at(-1);
        if (!group || (previous && item.x - previous.x - previous.width > page.width * .08)) groups.push([item]);
        else group.push(item);
      }
      for (const group of groups) {
        const text = group.map(item => item.text).join(" ").trim();
        const match = text.match(/^(?:第\s*(\d{1,3})\s*题|([1-9]\d{0,2})\s*[.．、](?!\d))/);
        const first = group[0], number = Number(match?.[1] || match?.[2]);
        if (number >= 1 && number <= 200 && first.y < page.height * .96)
          anchors.push({ page: page.page, number, x: first.x / page.width, y: first.y / page.height });
      }
    }
  }
  return anchors;
}

export function locateSectionBlocks(pages: PaperPage[]): PaperExcludedBlock[] {
  const blocks: PaperExcludedBlock[] = [];
  for (const page of pages) {
    const lines: PaperTextItem[][] = [];
    for (const item of [...page.items].sort((a,b)=>a.y-b.y||a.x-b.x)) {
      const line=lines.find(line=>Math.abs(line[0].y+line[0].height-item.y-item.height)<Math.max(3,item.height*.35));
      if(line)line.push(item);else lines.push([item]);
    }
    for(const line of lines) {
      const groups:PaperTextItem[][]=[];
      for(const item of line.sort((a,b)=>a.x-b.x)) {
        const group=groups.at(-1),previous=group?.at(-1);
        if(!group||(previous&&item.x-previous.x-previous.width>page.width*.08))groups.push([item]);else group.push(item);
      }
      for(const group of groups) {
        const text=group.map(i=>i.text).join('').replace(/\s/g,'');
        const y=Math.min(...group.map(i=>i.y))/page.height;
        const isSection=/^[一二三四五六七八九十百]+[、．.：:]/.test(text);
        const isFooter=y>.85&&/(?:第?\d+页.{0,12}共\d+页|(?:试卷|数学)第?\d+页)/.test(text);
        if(!isSection&&!isFooter)continue;
        blocks.push({page:page.page,x:group[0].x/page.width,y,bottom:Math.max(...group.map(i=>i.y+i.height))/page.height,kind:isFooter?'footer':'section'});
      }
    }
  }
  return blocks;
}

export function buildQuestionCrops(pages: PaperPage[], anchors: QuestionAnchor[], excluded: PaperExcludedBlock[] = []): QuestionCrop[] {
  // Apply text-layer section boundaries in every caller, including bulk import
  // and normal preparation, not only the AI detection path.
  const boundaries=[...locateSectionBlocks(pages),...excluded];
  const usable = anchors.filter(a => pages.some(p => p.page === a.page) && a.x >= 0 && a.x < 1 && a.y >= 0 && a.y < .97);
  const twoColumns = usable.some(a => a.x < .35) && usable.some(a => a.x > .48);
  const crops: QuestionCrop[] = [];
  let current: QuestionCrop | undefined;
  const seen = new Set<number>();
  let reachedAnswers = false;
  for (const page of pages) {
    if (/参考答案|答案解析|参考解析/.test(page.items.filter(item => item.y < page.height * .2).map(item => item.text).join(""))) reachedAnswers = true;
    if (reachedAnswers) break;
    const columns = twoColumns ? [[.02, .5], [.5, .98]] : [[.02, .98]];
    for (const [left, right] of columns) {
      const list = usable.filter(a => a.page === page.page && a.x >= left - .02 && a.x < right).sort((a, b) => a.y - b.y);
      let start = .035;
      const addRegion = (end: number) => {
        // A section heading ends the previous question, even if the next number
        // is on another page. Do not append the heading to either question.
        const stop = boundaries.filter(b => b.page === page.page && (b.kind === 'footer' || (b.x >= left - .02 && b.x < right)) && b.y >= start && b.y < end).sort((a,b) => a.y-b.y)[0];
        if (stop) end = Math.max(start, stop.y - .003);
        if (!current || end - start < .008) return;
        const region = { page: page.page, x: left, y: start, width: right - left, height: end - start };
        current.regions.push(region);
        const text = page.items.filter(i => i.x / page.width >= left && i.x / page.width < right && i.y / page.height >= start && i.y / page.height < end).sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.text).join(" ");
        current.text += (current.text ? "\n" : "") + text;
        if (stop?.kind === 'section') current = undefined;
      };
      for (const anchor of list) {
        addRegion(Math.max(start, anchor.y - .008));
        // Repeated numbering usually indicates the answer section; never silently merge it.
        if (seen.has(anchor.number)) { if (current?.number !== anchor.number) current = undefined; start = anchor.y; continue; }
        current = { number: anchor.number, regions: [], text: "" }; crops.push(current); seen.add(anchor.number);
        start = Math.max(0, anchor.y - .008);
      }
      addRegion(.96);
    }
  }
  return crops.filter(c => c.regions.length).sort((a, b) => a.number - b.number);
}
