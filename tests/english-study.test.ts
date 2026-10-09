import test from 'node:test';
import assert from 'node:assert/strict';
import { searchVocabulary, wordForms } from '../lib/english-study';
import dictionary from '../data/english/vocabulary.json';
import lessons from '../data/english/sentence-practice.json';
import papers from '../data/english/reading-practice.json';
import { POST } from '../app/api/english/vocabulary/route';

test('dictionary retains pinned source, license and valid exam tags',()=>{
  assert.equal(dictionary.source.license,'MIT');assert.match(dictionary.source.sha256,/^[a-f0-9]{64}$/);
  assert.equal(new Set(dictionary.entries.map(e=>e.word.toLowerCase())).size,dictionary.entries.length);
  assert.equal(dictionary.stats.total,dictionary.entries.length);
  for(const entry of dictionary.entries){assert.ok(entry.translation);assert.ok(entry.tags.length||entry.examples.length);assert.ok(entry.tags.every(t=>['gk','zk','cet4','cet6'].includes(t)));}
});
test('English, Chinese and inflected words are searchable with bounded pagination',()=>{
  assert.equal(searchVocabulary(new URLSearchParams({q:'go'})).entries[0].word,'go');
  assert.ok(searchVocabulary(new URLSearchParams({q:'went'})).entries.some(e=>e.word==='go'));
  assert.equal(searchVocabulary(new URLSearchParams({q:'estimation'})).entries[0].word,'estimation');
  assert.ok(searchVocabulary(new URLSearchParams({q:'居民'})).entries.some(e=>e.translation.includes('居民')));
  for(const input of ['NaN','Infinity','-10','999999']){const result=searchVocabulary(new URLSearchParams({page:input,tag:'gk',context:'1'}));assert.ok(result.page>=1&&result.page<=result.pages);assert.ok(result.entries.length<=12);assert.ok(result.entries.every(e=>e.tags.includes('gk')&&e.examples.length));}
  assert.equal(searchVocabulary(new URLSearchParams({q:'zzzzzzzzqqqq'})).total,0);
});
test('vocabulary examples are literal excerpts of their declared passages',()=>{
  const passages=new Map(papers.flatMap(p=>p.passages.map(t=>[t.id,t.text.replace(/\s+/g,' ')] as const)));
  for(const entry of dictionary.entries)for(const example of entry.examples)assert.ok(passages.get(example.passageId)?.includes(example.text),entry.word);
});
test('word forms distinguish lemma and tense labels',()=>{
  assert.deepEqual(wordForms('p:went/d:gone/0:go/1:p'),[{label:'过去式',value:'went'},{label:'过去分词',value:'gone'},{label:'原形',value:'go'}]);
});
test('review filtering does not show all words for an empty review list',async()=>{
  assert.equal(searchVocabulary(new URLSearchParams(),[]).total,0);
  const result=searchVocabulary(new URLSearchParams(),['go','resident']);assert.equal(result.total,2);
  const valid=await POST(new Request('http://localhost/api/english/vocabulary',{method:'POST',body:JSON.stringify({words:['go']})}));assert.equal(valid.status,200);
  for(const body of ['broken',JSON.stringify({words:[12]}),JSON.stringify({words:[],extra:'bad'})])assert.equal((await POST(new Request('http://localhost/api/english/vocabulary',{method:'POST',body}))).status,400);
});
test('sentence annotations partition actual exam text without dropping non-whitespace content',()=>{
  for(const lesson of lessons){
    const passage=papers.find(p=>p.paperId===lesson.paperId)?.passages.find(p=>p.id===lesson.passageId);
    assert.ok(passage?.text.replace(/\s+/g,' ').includes(lesson.text));
    let end=0;for(const chunk of lesson.chunks){assert.ok(chunk.start>=end);assert.equal(lesson.text.slice(end,chunk.start).trim(),'');assert.equal(lesson.text.slice(chunk.start,chunk.end),chunk.text);end=chunk.end;}
    assert.equal(end,lesson.text.length);assert.ok(lesson.quiz.answer>=0&&lesson.quiz.answer<lesson.quiz.options.length);assert.ok(lesson.sourceLocators.length);
  }
  assert.equal(lessons.length,12);
});
