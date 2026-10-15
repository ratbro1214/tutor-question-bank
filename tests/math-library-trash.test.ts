import test from 'node:test';
import assert from 'node:assert/strict';
import { graphFixture } from './support/knowledge-graph-fixture';
import { LibraryTrashStore } from '../lib/math-library-trash';
import { libraryBase } from '../lib/math-library-query';

test('移入和恢复：检索/统计隐藏题目，固定版本与原始内容保留，重复请求幂等', async () => {
 const f=graphFixture();
 try {
  const store=new LibraryTrashStore(f.binding,'teacher',['s']);
  const before=JSON.stringify(f.db.prepare('SELECT * FROM canonical_questions WHERE id=?').get(f.a.c));
  const count=()=>f.db.prepare(libraryBase(['s'])+'SELECT count(*) n FROM library').get('s')!.n;
  assert.equal(count(),1);
  await store.change(f.a.c);await store.change(f.a.c);
  assert.equal(count(),0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM math_library_trash').get()!.n,1);
  assert.equal(f.db.prepare(libraryBase(['s'],false,true)+'SELECT id FROM library').get('s')!.id,f.a.c);
  assert.equal(f.db.prepare(libraryBase(['s'],true)+'SELECT id FROM library').get(f.a.r,'s')!.id,f.a.c);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM canonical_questions WHERE id=?').get(f.a.c)),before);
  await store.change(f.a.c,true);await store.change(f.a.c,true);
  assert.equal(count(),1);assert.equal(f.db.prepare('SELECT count(*) n FROM math_library_trash').get()!.n,0);
 } finally { f.db.close(); }
});

test('跨范围删除/恢复与不存在题目拒绝，不改变其他教师数据',async()=>{
 const f=graphFixture();try{
  const store=new LibraryTrashStore(f.binding,'teacher',['s']);
  await assert.rejects(store.change(f.b.c),/无权访问/);
  const other=new LibraryTrashStore(f.binding,'other',['other']);await other.change(f.b.c);
  await assert.rejects(store.change(f.b.c,true),/无权访问/);
  await assert.rejects(store.change('missing'),/不存在/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM math_library_trash').get()!.n,1);
  assert.throws(()=>new LibraryTrashStore(f.binding,'',[]),/无权/);
 }finally{f.db.close();}
});

test('删除不影响原卷、解析与来源映射，恢复保留题目原状态',async()=>{
 const f=graphFixture();try{
  f.solution();
  const tables=['canonical_questions','canonical_question_revisions','paper_questions','papers','source_documents','question_occurrences','question_module_links','paper_solution_reviews'];
  const snapshot=()=>tables.map(t=>f.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all());
  const before=JSON.stringify(snapshot()),store=new LibraryTrashStore(f.binding,'teacher',['s']);
  await store.change(f.a.c);assert.equal(JSON.stringify(snapshot()),before);
  await store.change(f.a.c,true);assert.equal(JSON.stringify(snapshot()),before);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
