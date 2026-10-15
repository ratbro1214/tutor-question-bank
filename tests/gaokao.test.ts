import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import katex from 'katex';
import { gaokaoCatalog } from '../lib/gaokao-catalog';
import { splitMathText,normalizeMathCommands } from '../lib/math-text';
import { seniorTaxonomy } from '../lib/senior-taxonomy';
test('十年原卷完整，题号连续，文件校验与固定来源一致',()=>{
 assert.equal(gaokaoCatalog.papers.length,20);assert.equal(gaokaoCatalog.papers.reduce((n,p)=>n+p.questions.length,0),428);
 for(let year=2017;year<=2026;year++)for(let volume=1;volume<=2;volume++){
  const paper=gaokaoCatalog.papers.find(p=>p.year===year&&p.volume===volume);assert.ok(paper);
  assert.equal(paper.questions.length,year<=2019?23:year<=2023?22:19);
  assert.deepEqual(paper.questions.map(q=>q.number),Array.from({length:paper.questions.length},(_,i)=>i+1));
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`../public/gaokao/papers/${paper.key}.pdf`,import.meta.url))).digest('hex'),paper.pdfSha256);
  assert.match(paper.pdfSource,/\/blob\/[a-f0-9]{40}\//);assert.match(paper.textSource,/\/blob\/[a-f0-9]{40}\//);
  for(const q of paper.questions){assert.ok(q.text.length>10);assert.ok(q.solution.length>10||q.answer.length>0);if(q.classification)assert.equal(q.classification.needs_review,true);for(const k of q.classification?.knowledge_points||[])assert.ok(seniorTaxonomy.some(t=>t[0]===k.code));assert.doesNotMatch(q.text,/\\begin\{(?:answer|solution)\}/);}
 }
});
test('题干与解析的公式可显示，所有本地题图存在',()=>{
 const failures:string[]=[];
 for(const p of gaokaoCatalog.papers)for(const q of p.questions)for(const text of [q.text,q.answer,q.solution]){
  for(const m of text.matchAll(/!\[[^\]]*\]\((\/gaokao\/assets\/[^)]+)\)/g))assert.ok(fs.existsSync(new URL('../public'+m[1],import.meta.url)),m[1]);
  const withoutImages=text.replace(/!\[[^\]]*\]\([^)]*\)/g,'');
  for(const part of splitMathText(withoutImages))if(part.kind==='math')try{katex.renderToString(normalizeMathCommands(part.tex!),{throwOnError:true,strict:'error',trust:false,maxExpand:500,maxSize:10});}catch(e){failures.push(`${p.key}:${q.number} ${part.tex} ${(e as Error).message}`);}
 }
 assert.deepEqual(failures,[]);
});

