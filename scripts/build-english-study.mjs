import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
const papers=JSON.parse(await readFile('data/english/reading-practice.json','utf8'));
const source=JSON.parse(await readFile('../work/english-lexicon/source.json','utf8'));
const manifest=JSON.parse(await readFile('data/english/manifest.json','utf8'));
const artifacts=new Map(manifest.papers.flatMap(p=>p.artifacts.map(a=>[a.id,a])));
function sourceLinks(id){const a=artifacts.get(id);if(!a)throw Error(`Missing source artifact ${id}`);return {sourcePage:a.sourcePage,publicPath:a.publicPath,sourceName:a.sourceName};}
const examples=new Map();
for(const paper of papers) for(const passage of paper.passages){
  const sentences=passage.text.replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z“])/);
  for(const text of sentences){
    if(text.length<40 || text.length>450 || /_{3,}|\|/.test(text))continue;
    for(const word of new Set(text.toLowerCase().match(/[a-z]+(?:[-'][a-z]+)*/g)||[])){
      const list=examples.get(word)||[];
      if(list.length<3)list.push({text,paperId:paper.paperId,year:paper.year,volume:paper.volume,label:passage.label,passageId:passage.id,artifactId:passage.artifactId,sourceLocators:passage.sourceLocators,...sourceLinks(passage.artifactId)});
      examples.set(word,list);
    }
  }
}
function parseRow(text){
  const fields=[];let field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){fields.push(field);field='';}else field+=c;
  }
  if(quoted)return null;
  fields.push(field);return fields;
}
const entries=[];let header,buffer='',rows=0;
for await(const line of createInterface({input:createReadStream(source.rawPath),crlfDelay:Infinity})){
  buffer+=(buffer?'\n':'')+line;
  const fields=parseRow(buffer);if(!fields)continue;buffer='';
  if(!header){header=fields;continue;}rows++;
  if(fields.length!==header.length)throw Error(`CSV field mismatch at ${rows}`);
  const row=Object.fromEntries(header.map((k,i)=>[k,fields[i]]));
  const tags=(row.tag||'').split(' ').filter(t=>['zk','gk','cet4','cet6'].includes(t));
  if(!row.translation || !/^[a-z][a-z '-]*$/i.test(row.word))continue;
  if(!tags.length&&!examples.has(row.word.toLowerCase()))continue;
  const forms=(row.exchange||'').split('/').map(s=>s.split(':')[1]).filter(Boolean);
  const hits=[row.word.toLowerCase(),...forms].flatMap(w=>examples.get(w)||[]);
  const seen=new Set(); const linked=hits.filter(e=>{if(seen.has(e.text))return false;seen.add(e.text);return true;}).slice(0,3);
  if(!tags.length&&!linked.length)continue;
  entries.push({word:row.word,phonetic:row.phonetic,translation:row.translation.replace(/\\n/g,'\n'),definition:row.definition.replace(/\\n/g,'\n'),tags,exchange:row.exchange,forms,bnc:Number(row.bnc)||0,examples:linked});
}
if(buffer)throw Error('Unterminated CSV record');
entries.sort((a,b)=>b.examples.length-a.examples.length || (a.bnc||999999)-(b.bnc||999999) || a.word.localeCompare(b.word));
const {rawPath,...publicSource}=source;
const dictionary={source:publicSource,stats:{rawRows:rows,total:entries.length,withExamples:entries.filter(e=>e.examples.length).length,tags:Object.fromEntries(['zk','gk','cet4','cet6'].map(t=>[t,entries.filter(e=>e.tags.includes(t)).length]))},entries};
await writeFile('data/english/vocabulary.json',JSON.stringify(dictionary));
const annotations=JSON.parse(await readFile('data/english/sentence-lessons.json','utf8'));
const lessons=annotations.map((a,index)=>{
  const paper=papers.find(p=>p.paperId===a.paperId);
  const passage=paper?.passages.find(p=>p.label===a.label);
  if(!passage)throw Error(`Missing passage ${a.paperId} ${a.label}`);
  const normalized=passage.text.replace(/\s+/g,' ');
  const offset=normalized.indexOf(a.starts);if(offset<0)throw Error(`Missing sentence ${a.starts}`);
  let cursor=offset;
  const chunks=a.chunks.map(([text,role,explanation])=>{
    const start=normalized.indexOf(text,cursor);
    if(start<0 || normalized.slice(cursor,start).trim())throw Error(`Chunk mismatch ${a.paperId}: ${text}`);
    cursor=start+text.length;return {text,role,explanation,start:start-offset,end:cursor-offset};
  });
  const text=normalized.slice(offset,cursor);
  return {...a,id:`sentence_${index+1}`,year:paper.year,volume:paper.volume,title:paper.title,passageId:passage.id,artifactId:passage.artifactId,sourceLocators:passage.sourceLocators,...sourceLinks(passage.artifactId),text,chunks,context:normalized.slice(Math.max(0,offset-140),Math.min(normalized.length,cursor+140))};
});
await writeFile('data/english/sentence-practice.json',JSON.stringify(lessons,null,2));
await mkdir('../outputs/english-exams/sentences',{recursive:true});
await writeFile('../outputs/english-exams/sentences/sentence-practice.json',JSON.stringify(lessons,null,2));
await writeFile('../outputs/english-exams/vocabulary/source.json',JSON.stringify({...publicSource,stats:dictionary.stats},null,2));
console.log(JSON.stringify({dictionary:dictionary.stats,sentences:lessons.length}));
