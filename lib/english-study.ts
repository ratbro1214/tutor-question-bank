import vocabulary from '@/data/english/vocabulary.json';

export type VocabularyEntry = typeof vocabulary.entries[number];
export type VocabularyResult = {
  source: typeof vocabulary.source; stats: typeof vocabulary.stats;
  entries: VocabularyEntry[]; total: number; page: number; pages: number;
};
export const vocabularyTags: Record<string,string> = { gk:'高考', zk:'中考', cet4:'四级', cet6:'六级' };
export function searchVocabulary(params: URLSearchParams, words?:string[]): VocabularyResult {
  const q=(params.get('q')||'').trim().toLowerCase().slice(0,80);
  const tag=params.get('tag')||'';
  const pageInput=Number(params.get('page')||1);
  const selected=words?new Set(words):null;
  const candidates=vocabulary.entries.filter(e=>(!selected||selected.has(e.word)) && (!tag || e.tags.includes(tag)) &&
    (params.get('context')!=='1' || e.examples.length>0) &&
    (!q || e.word.toLowerCase().includes(q) || e.forms.some(f=>f.toLowerCase()===q) || e.translation.includes(q)));
  candidates.sort((a,b)=>Number(b.word.toLowerCase()===q)-Number(a.word.toLowerCase()===q));
  const pages=Math.max(1,Math.ceil(candidates.length/12));
  const page=Math.min(pages,Math.max(1,Number.isFinite(pageInput)?Math.floor(pageInput):1));
  return {source:vocabulary.source,stats:vocabulary.stats,entries:candidates.slice((page-1)*12,page*12),total:candidates.length,page,pages};
}
export function wordForms(exchange:string) {
  const labels:Record<string,string>={p:'过去式',d:'过去分词',i:'现在分词',s:'复数',r:'比较级',t:'最高级','3':'第三人称单数','0':'原形','1':'原形类别'};
  return exchange.split('/').flatMap(item=>{const [key,value]=item.split(':');return value&&labels[key]&&key!=='1'?[{label:labels[key],value}]:[];});
}
