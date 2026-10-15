import test from 'node:test';
import assert from 'node:assert/strict';
import { graphFixture } from './support/knowledge-graph-fixture';
import { CanonicalExplanationStore } from '../lib/canonical-explanation-store';
import { LibraryTrashStore } from '../lib/math-library-trash';
const value={content:{status:'ready' as const,answer:'答案为 2。',approach:'直接计算。',steps:[{title:'计算',content:'1+1=2'}],teachingNotes:'',commonMistakes:'',verification:'代回。',alternativeMethod:'',missingInformation:''},sourceText:'求 1+1',origin:'ai' as const,model:'mock',reviewed:false};
test('统一题库解析保存、重开和重新生成使用独立存储，不改原题及来源',async()=>{
 const f=graphFixture();try{
  const s=new CanonicalExplanationStore(f.binding,['s']);f.solution();
  const before=JSON.stringify(f.db.prepare('SELECT * FROM paper_questions').all());
  assert.equal(await s.read(f.a.c,f.a.r),null);
  const first=await s.save(f.a.c,f.a.r,0,value);assert.equal(first.revision,1);
  assert.equal((await s.read(f.a.c,f.a.r))?.content.answer,value.content.answer);
  const next=await s.save(f.a.c,f.a.r,1,{...value,content:{...value.content,answer:'重新核算为 2。'}});assert.equal(next.revision,2);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM paper_questions').all()),before);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
test('首次写入和更新冲突保留服务器解析，未知或跨范围题目拒绝',async()=>{
 const f=graphFixture();try{
  const s=new CanonicalExplanationStore(f.binding,['s']);
  await s.save(f.a.c,f.a.r,0,value);
  await assert.rejects(s.save(f.a.c,f.a.r,0,value),/已更新/);
  await s.save(f.a.c,f.a.r,1,value);
  await assert.rejects(s.save(f.a.c,f.a.r,1,value),/已更新/);
  await assert.rejects(s.read(f.b.c,f.b.r),/无权/);
  await assert.rejects(s.save('missing',f.a.r,0,value),/不存在/);
  assert.equal((await s.read(f.a.c,f.a.r))?.revision,2);
 }finally{f.db.close();}
});
test('题目内容变化或移入回收站后不能写入旧页面，未完成解析不能通过验证',async()=>{
 const f=graphFixture();try{
  const s=new CanonicalExplanationStore(f.binding,['s']);
  await assert.rejects(s.save(f.a.c,'wrong-version',0,value),/题目已更新/);
  await assert.rejects(s.save(f.a.c,f.a.r,0,{...value,content:{...value.content,steps:[]}}));
  await new LibraryTrashStore(f.binding,'teacher',['s']).change(f.a.c);
  await assert.rejects(s.save(f.a.c,f.a.r,0,value),/不存在/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_question_explanations').get()!.n,0);
 }finally{f.db.close();}
});
