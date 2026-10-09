import { readFile, writeFile, mkdir } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('data/english/manifest.json','utf8'));
const corrections = JSON.parse(await readFile('data/english/language-corrections.json','utf8'));
const answerCorrections = JSON.parse(await readFile('data/english/language-answer-corrections.json','utf8'));
const answerNormalizations = JSON.parse(await readFile('data/english/language-answer-normalizations.json','utf8'));
const results = [], issues = [];
const normalize = text => text.replace(/高考直通车 App生成 高考直通车/g,'').replace(/\n{3,}/g,'\n\n').trim();
function markBlanks(text, start, count) {
 const marks = [], fixes = [];
 const regex = new RegExp(`[_＿]*[ \\t]*(?<![\\d.])(${Array.from({length:count},(_,i)=>start+i).join('|')})(?!\\d|\\.\\d)(?:[.．](?=\\s*[_＿]))?[ \\t]*[_＿]*|[_＿]{2,}`, 'g');
 let cursor = 0, output = '';
 for (const m of text.matchAll(regex)) {
  const n = start + marks.length;
  if (m[1] && Number(m[1]) !== n) throw new Error(`blank sequence: expected ${n}, found ${m[1]}`);
  output += text.slice(cursor,m.index).trimEnd() + ` [[${n}]] `;
  cursor = m.index + m[0].length; marks.push(n);
  if (!m[1]) fixes.push({ number:n, original:m[0], method:'blank-position-in-contiguous-section', note:'OCR缺失空号；按本节连续空位恢复，保留原文供校对' });
 }
 output += text.slice(cursor);
 if (marks.length !== count) throw new Error(`blank count ${marks.length} != ${count}`);
 return { text: normalize(output), fixes };
}
function parseOptions(body) {
 const matches = [...body.matchAll(/(?<![a-zA-Z])([ABCD])\s*[.．、]\s*/g)];
 if (matches.map(m=>m[1]).join('') !== 'ABCD') throw Error(`options: ${body.slice(0,130)}`);
 return matches.map((m,i)=>({label:m[1],text:normalize(body.slice(m.index+m[0].length,matches[i+1]?.index??body.length))}));
}
function numberedAnswers(text) {
 const map = new Map();
 for (const m of text.matchAll(/(?<!\d)(\d{1,2})(?:\s*[.．、]\s*|\s+)([A-Za-z][A-Za-z'’ /#-]*?)(?=\s*(?:\d{1,2}\s*[.．、]|[\r\n|]|[\u4e00-\u9fff])|$)/g)) {
  const value = m[2].trim().replace(/#+/g,'/');
  if (value && value.length < 45 && !map.has(Number(m[1]))) map.set(Number(m[1]), value);
 }
 return map;
}
function attachAnswers(p, cloze, grammar) {
 const evidence = [];
 // Select one complete key per section and retain the exact source numbering.
 for (const t of [cloze,grammar]) {
  const base=t.questions[0].number;
  let selected;
  for (const a of p.answers) {
   let answerText = a.text.replace(/\r\n/g, '\n');
   for (const c of answerCorrections.filter(c => c.artifactId === a.artifactId)) {
    if (!answerText.includes(c.ocr)) throw Error(`Answer correction target missing: ${c.ocr}`);
    answerText = answerText.replace(c.ocr, c.transcription);
   }
   // Read compact answer lists before long explanations repeat the same numbers.
   const key = answerText.split(/【分析】|【解析】|【详解】/)[0];
   const pairs=numberedAnswers(key);
   if (t.label==='完形填空' && /完[形型]填空\s*\n/.test(a.text)) {
    const compact=a.text.match(/完[形型]填空\s*\n([A-D\s]+)/);
    if(compact){const values=compact[1].replace(/\s/g,'');if(values.length===15)[...values].forEach((v,i)=>pairs.set(base+i,v));}
   }
   for (const offset of [0,20,40,5,-20]) {
    const values=t.questions.map(q=>pairs.get(q.number-offset));
    if(values.every(v=>v && (t.label==='完形填空'? /^[A-D]$/.test(v) : !/^[A-G]$/.test(v)))) { selected={a,offset,values}; break; }
   }
   if(selected)break;
  }
  if (!selected) { issues.push({paper:p.paperId,section:t.label,error:'No complete numbered answer key'}); continue; }
  t.questions.forEach((q,i)=>{
   const raw=selected.values[i], id=`${q.id}_source_${selected.a.artifactId.split('_').at(-1)}`;
   const normalization=answerNormalizations.find(n=>n.paperId===p.paperId&&n.number===q.number);
   if(normalization && normalization.sourceAnswer!==raw)throw Error(`Normalization source mismatch: ${q.id}`);
   q.answer=normalization?.answer??raw; q.acceptedAnswers=q.answer.split(/\s*\/\s*/).filter(Boolean); q.answerStatus='SOURCE_ALIGNED'; q.answerEvidenceId=id;
   const artifact=manifest.papers.find(x=>x.id===p.paperId).artifacts.find(x=>x.id===selected.a.artifactId);
   evidence.push({id,questionId:q.id,artifactId:artifact.id,sourceNumber:q.number-selected.offset,questionNumber:q.number,rawAnswer:raw,normalizedAnswer:q.answer,method:normalization?'source-context-normalization':selected.offset?`mineru-number-offset-${selected.offset}`:'mineru-question-number',normalizationReason:normalization?.reason,sourceUrl:artifact.sourceUrl,publicPath:artifact.publicPath});
  });
 }
 return evidence;
}
for (const paper of manifest.papers) {
 const p=JSON.parse(await readFile(`../work/english-language/${paper.id}.json`,'utf8'));
 for(const c of corrections.filter(c=>c.paperId===p.paperId)) {if(!p.text.includes(c.ocr))throw Error(`Correction target missing: ${c.ocr}`);p.text=p.text.replace(c.ocr,c.transcription);}
 try {
  const sectionAt=p.text.search(/第\s*二\s*节/), first=p.text.slice(0,sectionAt), second=p.text.slice(sectionAt);
  if(sectionAt<0)throw Error('second section missing');
  const qs=[...first.matchAll(/(?:^|\n)(?:[（(]\s*[）)]\s*)?(\d{1,2})\s*[.．、]\s*(?=A\s*[.．、])/g)];
  if(qs.length!==15)throw Error(`cloze question count ${qs.length}`);
  const base=Number(qs[0][1]);
  const instruction=first.match(/阅读下面短文[\s\S]*?最佳选项[。.]?/);
  if(!instruction)throw Error('cloze instructions missing');
  const prefixLength=instruction.index+instruction[0].length;
  const clozeMarks=markBlanks(first.slice(prefixLength,qs[0].index),base,15);
  const cloze={id:`${p.paperId}_language_cloze`,label:'完形填空',type:'CLOZE',text:clozeMarks.text,artifactId:p.artifactId,sourceLocators:p.sourceLocators,numberRepairs:clozeMarks.fixes,questions:[]};
  for(let i=0;i<qs.length;i++) { const q=qs[i],n=Number(q[1]); if(n!==base+i)throw Error('cloze numbering'); cloze.questions.push({id:`${p.paperId}_LQ${n}`,number:n,type:'CLOZE',stem:`第 ${n} 空`,options:parseOptions(first.slice(q.index+q[0].length,qs[i+1]?.index??first.length)),answer:null}); }
  const body=second.replace(/^第二节[^\n]*\n/,'').replace(/阅读下面短文[^\n]*\n/,'').replace(/确形\s*\n\s*式[。.]?/,'');
  const grammarMarks=markBlanks(body,base+15,10);
  const grammar={id:`${p.paperId}_language_grammar`,label:'语法填空',type:'GRAMMAR_FILL',text:grammarMarks.text,artifactId:p.artifactId,sourceLocators:p.sourceLocators,numberRepairs:grammarMarks.fixes,questions:[]};
  for(let n=base+15;n<base+25;n++){
   const marker=`[[${n}]]`,at=grammar.text.indexOf(marker),next=grammar.text.slice(at+marker.length),given=next.match(/^\s*[（(]\s*([a-zA-Z]+)\s*[）)]/);
   grammar.questions.push({id:`${p.paperId}_LQ${n}`,number:n,type:'GRAMMAR_FILL',stem:`第 ${n} 空`,givenWord:given?.[1]??null,context:grammar.text.slice(Math.max(0,at-125),Math.min(grammar.text.length,at+marker.length+155)).trim(),options:[],answer:null});
  }
  const evidence=attachAnswers(p,cloze,grammar);
  results.push({paperId:p.paperId,year:p.year,volume:p.volume,title:p.title,passages:[cloze,grammar],evidence,extractionCorrections:corrections.filter(c=>c.paperId===p.paperId),answerCorrections:answerCorrections.filter(c=>c.paperId===p.paperId)});
  console.log(p.paperId,cloze.questions.filter(q=>q.answer).length,grammar.questions.filter(q=>q.answer).length, 'answers; repairs',clozeMarks.fixes.length+grammarMarks.fixes.length);
 }catch(e){issues.push({paper:p.paperId,error:e.message});console.log(p.paperId,e.message);}
}
await mkdir('../outputs/english-exams/language',{recursive:true});
await writeFile('../outputs/english-exams/language/extraction-issues.json',JSON.stringify(issues,null,2));
await writeFile('../work/english-language/language-draft.json',JSON.stringify(results,null,2));
if(issues.length){console.log(issues);process.exitCode=1;}
else {await writeFile('data/english/language-practice.json',JSON.stringify(results,null,2));await writeFile('../outputs/english-exams/language/language-practice.json',JSON.stringify(results,null,2));}
