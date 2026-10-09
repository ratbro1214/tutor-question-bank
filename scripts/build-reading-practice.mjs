import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const manifest=JSON.parse(await readFile('data/english/manifest.json','utf8'));
const corrections=JSON.parse(await readFile('data/english/extraction-corrections.json','utf8'));
const figures=JSON.parse(await readFile('data/english/reading-figures.json','utf8'));
const work=path.resolve('../work/english-reading');
const results=[],issues=[];
export function clean(text){
 return text.replace(/<!--[^]*?-->/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
 .replace(/<table[^>]*>([^]*?)<\/table>/gi,(_,table)=>table.replace(/<tr[^>]*>([^]*?)<\/tr>/gi,(_,row)=>'\n| '+[...row.matchAll(/<t[dh][^>]*>([^]*?)<\/t[dh]>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' ').trim()).join(' | ')+' |\n'))
 .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
 .replace(/\\([_$])/g,'$1').replace(/\*\*/g,'').replace(/^#{1,6}\s*/gm,'').replace(/```(?:txt|text)?/g,'')
 .replace(/^\s*\d{1,2}\s*$/gm,'').replace(/^.*(?:英语试题第|英语试题参考答案第|页（共\d+页）|页\(共\d+页\)).*$/gm,'')
 .replace(/^第\d+页\s*[/／]\s*共\d+页\s*$/gm,'').replace(/\$(\d+(?:\.\d+)?)\\%\$/g,'$1%')
 .replace(/\$(?:\\mathrm\{)?CO\}?_\{2\}\$/g,'CO₂')
 .replace(/\n{3,}/g,'\n\n').trim();
}
function options(text, letters='ABCD'){
 const regex=new RegExp(`(?<![A-Za-z])([${letters}])[ \\t]*[.．、][ \\t]*|(?:^[ \\t]*|[ \\t]{2,}|(?<=[.．]))([${letters}])[ \\t]+`,'gm');
 const candidates=[...text.matchAll(regex)].map(m=>{m[1] ||= m[2];return m;});
 let matches;
 for(let i=0;i<candidates.length;i++)if(candidates.slice(i,i+letters.length).map(m=>m[1]).join('')===letters)matches=candidates.slice(i,i+letters.length);
 if(!matches)throw Error(`options ${candidates.map(m=>m[1]).join('')}, expected ${letters}: ${text.slice(0,100)}`);
 return {start:matches[0].index,values:matches.map((m,i)=>({label:m[1],text:clean(text.slice(m.index+m[0].length,matches[i+1]?.index??text.length))}))};
}
async function load(p){
 if(p.id==='gaokao_en_2024_I'){const artifact=p.artifacts.find(a=>a.mime==='application/pdf');return {text:await readFile('../work/2024-I.md','utf8'),artifact,locators:[`doc:${artifact.sha256.slice(0,7)}/tier:standard/pages:1-18`]};}
 const direct=p.artifacts.find(a=>a.kind==='paper' && /\.docx?$/.test(a.filename)) || (p.id==='gaokao_en_2021_I' ? p.artifacts.find(a=>a.mime==='application/pdf') : null);
 if(direct) return {text:await readFile(path.resolve(`../work/${p.year}-${p.volume}.md`),'utf8'),artifact:direct,locators:[`doc:${direct.sha256.slice(0,7)}/tier:${direct.mime==='application/pdf'?'standard':'flash'}`]};
 const source=p.artifacts.filter(a=>a.kind==='paper' && a.mime?.startsWith('image/'));
 const texts=[];for(const a of source) texts.push(await readFile(path.join(work,`${a.id}.md`),'utf8'));
 return {text:texts.join('\n\n'),artifact:source[0],locators:source.map(a=>`doc:${a.sha256.slice(0,7)}/tier:standard/page:1`)};
}
function parseReading(p,source){
 let text=source.text;for(const c of corrections.filter(c=>c.paperId===p.id))text=text.replace(c.ocr,c.transcription);
 const all=clean(text);
 const start=all.search(/第[一二](?:部分|都分)\s*阅读(?:理解)?/);
 if(start<0)throw Error('reading heading missing');
 let section=all.slice(start);
 const end=section.search(/第[二三]部分\s*语言(?:运用)?/);if(end<0)throw Error('language heading missing');section=section.slice(0,end);
 const gapStart=section.search(/第\s*二\s*节/);if(gapStart<0)throw Error('gap section missing');
 const reading=section.slice(0,gapStart), gap=section.slice(gapStart);
 const marks=[...reading.matchAll(/^([ABCD])\s*$/gm)];
 if(marks.map(m=>m[1]).join('')==='BCD'){const instruction=reading.match(/阅读下列短文[^\n]*\n/);if(instruction)marks.unshift({1:'A',index:instruction.index+instruction[0].length});}
 if(marks.map(m=>m[1]).join('')!=='ABCD')throw Error(`passage labels ${marks.map(m=>m[1]).join('')}`);
 const passageList=[];
 for(let i=0;i<4;i++){
  const m=marks[i], chunk=reading.slice(m.index,marks[i+1]?.index??reading.length).trim();
  const qm=[...chunk.matchAll(/(?:^|\n)(\d{1,2})\s*[.．、]\s*/g)];
  const expected=i===0?3:4;if(qm.length!==expected)throw Error(`${m[1]} question count ${qm.length} != ${expected}`);
  const passage={id:`${p.id}_reading_${m[1]}`,label:m[1],type:'MCQ',text:clean(chunk.slice(0,qm[0].index).replace(/^[ABCD]\s*\n/,'')),artifactId:source.artifact.id,sourceLocators:source.locators,questions:[]};
  for(let k=0;k<qm.length;k++){
   const q=qm[k];let body=chunk.slice(q.index+q[0].length,qm[k+1]?.index??chunk.length);
   const parsed=options(body);
   passage.questions.push({id:`${p.id}_Q${q[1]}`,number:Number(q[1]),type:'MCQ',stem:clean(body.slice(0,parsed.start)),options:parsed.values,answer:null});
  }
  passageList.push(passage);
 }
 const nums=passageList.flatMap(p=>p.questions.map(q=>q.number));
 const base=nums[0]===1?1:21;
 if(nums.join(',')!==Array.from({length:15},(_,i)=>i+base).join(','))throw Error(`reading numbering ${nums.join(',')}`);
 // The seven-option bank follows the gap passage. Keep its five numbered blanks as separate questions.
 const bank=options(gap,'ABCDEFG');
 const gapText=clean(gap.slice(0,bank.start).replace(/^第二节[^\n]*\n/,'').replace(/^阅读下面短文[^\n]*\n/m,''))
  .replace(/(?:_+\s*(\d{1,2})\s*_*|(\d{1,2})\s*_+)/g,(raw,a,b)=>{const n=Number(a??b);return n>=base+15&&n<base+20?`____ ${n} ____`:raw;});
 const gapPassage={id:`${p.id}_reading_七选五`,label:'七选五',type:'GAP_FILL',text:gapText,artifactId:source.artifact.id,sourceLocators:source.locators,questions:[]};
 for(let number=base+15;number<base+20;number++)gapPassage.questions.push({id:`${p.id}_Q${number}`,number,type:'GAP_FILL',stem:`第 ${number} 空`,options:bank.values,answer:null});
 passageList.push(gapPassage);
 return passageList;
}
function answerPairs(text){
 const map=new Map();text=clean(text);
 for(const m of text.matchAll(/(?:^|[\s|，,;；】])([1-6]?\d)\s*(?:[.．、:：]\s*|\s+)([A-G])(?=$|[\s|，,;；\d])/gm))map.set(Number(m[1]),m[2]);
 const rows=text.split('\n').filter(l=>l.startsWith('|')).map(l=>l.split('|').slice(1,-1).map(c=>c.trim()));
 for(let i=0;i<rows.length-1;i++)if(rows[i][0]==='题号'&&rows[i+1][0]==='答案'){
  const nums=rows[i].slice(1).map(Number),values=rows[i+1].slice(1);
  nums.forEach((n,j)=>{if(n<nums[j-1]&&nums[j+1]===nums[j-1]+2)n=nums[j-1]+1;if(/^[A-G]$/.test(values[j]))map.set(n,values[j]);});
 }
 return map;
}
async function attachAnswers(p,passages){
 const candidates=[];
 const word=p.artifacts.find(a=>a.kind==='paper' && /\.docx?$/.test(a.filename));
 if(word){const text=await readFile(path.resolve(`../work/${p.year}-${p.volume}.md`),'utf8');const idx=text.search(/参考答案/);if(idx>=0)candidates.push({artifact:word,text:text.slice(idx)});}
 if(p.id==='gaokao_en_2021_I'){const a=p.artifacts.find(a=>a.mime==='application/pdf'),text=await readFile('../work/2021-I.md','utf8'),idx=text.search(/参考答案/);if(idx>=0)candidates.push({artifact:a,text:text.slice(idx)});}
 for(const a of p.artifacts.filter(a=>a.kind==='answer'||a.mime?.startsWith('image/'))){
  try{const text=await readFile(path.join(work,`${a.id}.md`),'utf8');if(a.kind==='answer'||/参考答案|【答案】|其余题型答案/.test(text))candidates.push({artifact:a,text});}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const evidence=[];
 // Prefer explicitly identified answer artifacts. Never compare answers with another source.
 candidates.sort((a,b)=>Number(/题号/.test(b.text))-Number(/题号/.test(a.text)) || Number(b.artifact.kind==='answer')-Number(a.artifact.kind==='answer'));
 const remaining=passages.flatMap(p=>p.questions);
 for(const c of candidates){
  let text=clean(c.text);const read=text.search(/第[一二]部分\s*阅读/);if(read>=0){text=text.slice(read);const end=text.search(/第[二三]部分\s*语言/);if(end>=0)text=text.slice(0,end);}
  const pairs=answerPairs(text);
  if(p.id==='gaokao_en_2024_I'){
   const compact=text.match(/阅读理解\s*\n([A-D\s]+)\n七选五\s*\n([A-G\s]+)/);
   if(compact){const a=compact[1].replace(/\s/g,''),b=compact[2].replace(/\s/g,'');if(a.length===15&&b.length===5){[...a+b].forEach((v,i)=>pairs.set(i+21,v));}}
  }
  // One published 2021 II key renumbers the 20 reading items as 1–20. Preserve and record that explicit offset.
  const base=passages[0].questions[0].number;
  const offset=c.artifact.sourcePage.includes('2227908')?5:c.artifact.sourcePage.includes('2258743')?20:base===21 && pairs.has(1)&&pairs.has(15)&&pairs.has(20)&&!pairs.has(40)?20:base===1&&pairs.has(21)&&pairs.has(40)?-20:0;
  for(const q of remaining){if(q.answer)continue;const sourceNumber=q.number-offset,answer=pairs.get(sourceNumber);if(!answer)continue;
   const id=`${q.id}_source_${c.artifact.sha256.slice(0,12)}`;
   q.answer=answer;q.answerStatus='SOURCE_ALIGNED';q.answerEvidenceId=id;
   evidence.push({id,questionId:q.id,artifactId:c.artifact.id,sourceNumber,questionNumber:q.number,rawAnswer:answer,normalizedAnswer:answer,method:offset?`mineru-number-offset-${offset}`:'mineru-question-number',sourceUrl:c.artifact.sourceUrl});
  }
 }
 const missing=remaining.filter(q=>!q.answer).map(q=>q.number);
 if(missing.length)throw Error(`missing answers: ${missing.join(',')}`);
 return evidence;
}
for(const p of manifest.papers){
 try{const source=await load(p),passages=parseReading(p,source),evidence=await attachAnswers(p,passages);for(const t of passages)t.figures=figures.filter(f=>f.passageId===t.id);results.push({paperId:p.id,year:p.year,volume:p.volume,title:p.title,passages,evidence,extractionCorrections:corrections.filter(c=>c.paperId===p.id)});console.log(p.id,'5 passages, 20 aligned answers');}
 catch(e){issues.push({paper:p.id,error:e.message});console.log(p.id,e.message);}
}
await mkdir('../outputs/english-exams/reading',{recursive:true});
await writeFile('../outputs/english-exams/reading/extraction-issues.json',JSON.stringify(issues,null,2));
await writeFile('data/english/reading-practice.json',JSON.stringify(results,null,2));
if(issues.length)process.exitCode=1;
else await writeFile('../outputs/english-exams/reading/reading-practice.json',JSON.stringify(results,null,2));
