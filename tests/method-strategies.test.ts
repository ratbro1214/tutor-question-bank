import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { coreStrategies, importCoreStrategies, strategyImportPlan, validateStrategyDataset } from '../lib/method-strategies';
import { decideStrategies } from '../lib/strategy-decision';
import { methodNetwork, methodNeighborhood } from '../lib/method-network';
import { methodContentSchema, type GraphMethod } from '../lib/knowledge-graph';
import { recommendWithFallback } from '../lib/method-recommendation';
import { graphFixture } from './support/knowledge-graph-fixture';
import { seniorTaxonomy } from '../lib/senior-taxonomy';
import catalog from '../data/knowledge_graph/senior-math-v1.json';
import { importKnowledgeCatalog } from '../lib/knowledge_graph/seed-store';

const methods: GraphMethod[] = coreStrategies.cards.map(c=>({id:c.strategy.key,scope_id:'s',revision:1,status:'approved',content:c,source:{origin:'pilot',note:'TEST',evidence:null},merged_into:null,updated_at:'now',evidenceValid:true}));
const facts = {domain:'checked',degeneration:'checked',separable:'yes',divisor:'positive',quantifier:'all',bound:'upper',objective:'maximum'};
function prepare(f: ReturnType<typeof graphFixture>) {
  for(const [code,name,chapter] of seniorTaxonomy) f.db.prepare('INSERT OR IGNORE INTO knowledge_points(code,name,chapter_code) VALUES(?,?,?)').run(code,name,chapter);
  importKnowledgeCatalog(f.db,catalog);
}
test('23张内容齐备、引用真实知识编码；拒绝重复、悬空、先修循环及未知字段',()=>{
  assert.equal(coreStrategies.cards.length,23);
  assert.equal(coreStrategies.cards.filter(c=>c.strategy.family==='parameter').length,11);
  assert.equal(coreStrategies.cards.filter(c=>c.strategy.family==='inequality').length,12);
  for(const c of coreStrategies.cards){assert.ok(c.strategy.examples[0].solution);assert.ok(c.limitations.length);}
  for(const mutate of [
    (d:typeof coreStrategies)=>d.cards.push(d.cards[0]),
    (d:typeof coreStrategies)=>d.cards[0].strategy.links.push({type:'alternative',targetKey:'missing',reason:'TEST'}),
    (d:typeof coreStrategies)=>d.cards[0].strategy.knowledgeCodes.push('invented'),
    (d:typeof coreStrategies)=>{d.cards[0].strategy.links=[{type:'prerequisite',targetKey:d.cards[1].strategy.key,reason:'TEST'}];},
  ]) { const d=structuredClone(coreStrategies);mutate(d);assert.throws(()=>validateStrategyDataset(d)); }
  const old={...methods[0].content};delete old.strategy;
  assert.deepEqual(methodContentSchema.parse(old),old);
});
test('导入走原方法及关系表，重复导入零新增，保留教师改动与拒绝状态及旧数据',async()=>{
  const f=graphFixture();try{prepare(f);
    const before=f.db.prepare('SELECT * FROM canonical_question_revisions').all();
    const p=await importCoreStrategies(f.store,'s',true);assert.equal(p.plan.length,23);assert.equal((await f.store.methods(false)).length,0);
    const first=await importCoreStrategies(f.store,'s');assert.equal(first.inserted,23);assert.equal(first.relationsInserted,58);
    assert.equal((await f.store.methods()).length,0);assert.equal((await f.store.relations()).length,0);
    const m=(await f.store.methods(false))[0];
    await f.store.writeMethod(m.id,{operationId:randomUUID(),expectedRevision:m.revision,scopeId:'s',status:'rejected',content:{...m.content,summary:'TEST 教师修订'},source:m.source});
    const second=await importCoreStrategies(f.store,'s');assert.equal(second.inserted,0);assert.equal(second.relationsInserted,0);
    const current=await f.store.getMethod(m.id);assert.equal(current.content.summary,'TEST 教师修订');assert.equal(current.status,'rejected');assert.equal(current.revision,2);
    assert.deepEqual(f.db.prepare('SELECT * FROM canonical_question_revisions').all(),before);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.db.close();}
});
test('相同名称先保留，旧母方法只提供映射与相似建议，不自动覆盖或合并',()=>{
  const legacy={...methods[0],id:'legacy',content:{...methods[0].content,name:'参数分离法',strategy:undefined}};
  const plan=strategyImportPlan([methods[0],legacy]);assert.equal(plan[0].action,'preserve');assert.equal(plan[1].legacy[0].id,'legacy');
  const sameName={...methods[1],content:{...methods[1].content,strategy:undefined}};
  assert.equal(strategyImportPlan([sameName])[1].action,'preserve');
});
test('权限隔离、新卡先候选、审核有版本记录，重复策略键被SQL唯一索引拒绝',async()=>{
  const f=graphFixture();try{prepare(f);
    await assert.rejects(importCoreStrategies(f.store,'other'),/无权/);
    await assert.rejects(f.store.writeMethod(randomUUID(),{operationId:randomUUID(),expectedRevision:0,scopeId:'s',status:'approved',content:methods[0].content,source:methods[0].source}),/候选/);
    await importCoreStrategies(f.store,'s');const m=(await f.store.methods(false))[0];
    const approved=await f.store.writeMethod(m.id,{operationId:randomUUID(),expectedRevision:1,scopeId:'s',status:'approved',content:m.content,source:m.source});
    assert.equal(approved.status,'approved');assert.equal(approved.versions.length,2);assert.equal((await f.other.methods(false)).length,0);
    assert.throws(()=>f.db.prepare("INSERT INTO math_methods SELECT 'duplicate',owner_id,scope_id,revision,'op',status,content,source,reviewer,NULL,created_at,updated_at FROM math_methods WHERE id=?").run(m.id),/UNIQUE/);
    await assert.rejects(f.store.writeMethod(m.id,{operationId:randomUUID(),expectedRevision:2,scopeId:'s',status:'approved',content:{...m.content,strategy:undefined},source:m.source}),/身份键/);
  }finally{f.db.close();}
});
test('规则不以关键词验证条件；候选卡、无效来源和拒绝方法不能成为首选事实',()=>{
  const r=decideStrategies('含参函数恒成立问题',methods);assert.ok(r.items.length);assert.ok(r.items.every(i=>i.verdict==='conditional'));
  const confirmed=decideStrategies('含参函数恒成立问题',methods,facts);assert.equal(confirmed.items[0].key,'p-worst-constant');assert.equal(confirmed.items[0].verdict,'preferred');
  const pending=decideStrategies('含参函数恒成立问题',methods.map(m=>({...m,status:'candidate'})),facts);assert.ok(pending.items.every(i=>i.verdict==='conditional'));
  assert.equal(decideStrategies('含参函数恒成立问题',methods.map(m=>({...m,evidenceValid:false})),facts).items.length,0);
});
test('除数变号与零点阻止整体分离，负除数反向，全称/存在及上下界方向不同',()=>{
  for(const divisor of ['changes','zero']) {const r=decideStrategies('含参函数恒成立问题',methods,{...facts,divisor});assert.ok(r.risks.some(s=>s.includes('变号')));assert.ok(r.items.every(i=>i.verdict!=='preferred'));}
  assert.ok(decideStrategies('含参函数恒成立问题',methods,{...facts,divisor:'negative'}).trace.some(s=>s.includes('反转')));
  assert.ok(decideStrategies('含参函数恒成立问题',methods,{...facts,bound:'lower'}).trace.some(s=>s.includes('sup')));
  const mismatch=decideStrategies('含参函数恒成立问题',methods,{...facts,objective:'minimum'});assert.notEqual(mismatch.items.find(i=>i.key==='p-worst-constant')?.verdict,'preferred');assert.ok(mismatch.checks.some(s=>s.includes('是否存在')));
  const exists=decideStrategies('存在参数不等式',methods,{...facts,quantifier:'exists'});assert.ok(exists.trace.some(s=>s.includes('并集')));assert.ok(exists.items.every(i=>i.key!=='p-worst-constant'));
});
test('等号不可达、非正项、PDF乱码及非本专题几何题均保守处理',()=>{
  const r=decideStrategies('x>0，求最小值',methods,{domain:'checked',positive:'yes',structure:'fixedProduct',equality:'unreachable'});assert.equal(r.items[0].key,'i-interval');assert.ok(r.risks.some(s=>s.includes('最小值')));
  const negative=decideStrategies('求最小值',methods,{domain:'checked',positive:'no',structure:'fixedProduct',equality:'reachable'});assert.ok(!negative.items.some(i=>i.key==='i-fixed-product'));
  assert.equal(decideStrategies('参数最小值\uF03E',methods,facts).items.length,0);
  assert.equal(decideStrategies('四棱锥空间夹角的最大值',methods).items.length,0);
});
test('AI未配置时无需额外API调用即降级规则；取消请求不降级',async()=>{
  const provider={apiKey:'',baseUrl:'https://example.invalid',model:'test',apiStyle:'chat_completions' as const,strictJsonSchema:false};
  const r=await recommendWithFallback('含参函数恒成立问题',methods,provider);assert.equal(r.engine,'rules');assert.ok(r.result.items.every(i=>i.verdict==='uncertain'&&i.steps.length===0));
  const c=new AbortController();c.abort();await assert.rejects(recommendWithFallback('参数问题',methods,provider,c.signal));
});
test('方法网络只显示同批输入中的合法节点；双方审核才展示正式边，邻居有界',()=>{
  const mixed=methods.map((m,i)=>i===0?{...m,status:'candidate' as const}:m);
  const graph=methodNetwork(mixed,true);assert.ok(!graph.nodes.some(n=>n.id===methods[0].id));assert.ok(graph.edges.every(e=>e.reviewed));
  const draft=methodNetwork(mixed);assert.ok(draft.edges.some(e=>!e.reviewed));
  const neighborhood=methodNeighborhood(methods,methods[0].id,[]);assert.ok(neighborhood.nodes.length>1&&neighborhood.nodes.length<=24);
  const start=performance.now();for(let i=0;i<1000;i++) methodNeighborhood(methods,methods[i%23].id,[]);assert.ok(performance.now()-start<2000);
});
test('从规则召回到教师确认题目关系的真实SQL闭环；候选关联不进入正式查询',async()=>{
  const f=graphFixture();try{prepare(f);await importCoreStrategies(f.store,'s');
    const solution=f.solution(), {evidence}=await f.store.evidence(f.a.c,f.a.r,solution.review);
    const m=(await f.store.methods(false)).find(m=>m.content.strategy!.key==='i-square')!;
    await f.store.writeMethod(m.id,{operationId:randomUUID(),expectedRevision:1,scopeId:'s',status:'approved',content:m.content,source:m.source});
    const id=randomUUID();const input={operationId:randomUUID(),expectedRevision:0,scopeId:'s',status:'candidate' as const,type:'uses' as const,fromKnowledge:null,toKnowledge:null,methodId:m.id,canonicalId:f.a.c,revisionId:f.a.r,source:{origin:'manual' as const,note:'TEST 核验',evidence}};
    await f.store.writeRelation(id,input);assert.ok(!(await f.store.relations(true,'s',{canonicalId:f.a.c})).some(r=>r.type==='uses'));
    await f.store.writeRelation(id,{...input,operationId:randomUUID(),expectedRevision:1,status:'approved'});assert.equal((await f.store.relations(true,'s',{canonicalId:f.a.c})).filter(r=>r.type==='uses').length,1);
    f.db.prepare("UPDATE paper_solution_reviews SET teacher_status='rejected' WHERE id=?").run(solution.review);
    assert.equal((await f.store.relations(true,'s',{canonicalId:f.a.c})).filter(r=>r.type==='uses').length,0);
  }finally{f.db.close();}
});
test('关键例题数值回归：退化、根碰撞、驻点端点、不可达等号、同步等号',()=>{
  // Independent numerical checks of the authored algebraic examples, not a symbolic proof engine.
  for(const a of [-2,-1,0,.5,.75,1,1.5,2]){
    const degree=a===1?1:2,delta=4*a-3;assert.equal(degree===1||delta===0,[.75,1].includes(a));
    const inside=a<1&&a>0;const root=a<=1?Math.sqrt(1-a):NaN;assert.equal(inside,1-root>0&&1+root<2&&root>0);
    const expected=a<=0?0:a>=1?1-2*a:-a*a;const x=Math.max(0,Math.min(1,a));assert.ok(Math.abs(x*x-2*a*x-expected)<1e-12);
  }
  for(let x=2.01;x<10;x+=.1) assert.ok(x+1/x>2.5);
  const x=Math.sqrt(2.5);assert.ok(Math.abs(2*x+5/x-2*Math.sqrt(10))<1e-12);assert.ok(2*Math.sqrt(10)>6);
  for(let x=.1;x<5;x+=.1) assert.ok(Math.abs((x*x+2/x-3)-(x-1)**2*(x+2)/x)<1e-10);
});
test('旧库尚未应用0025时，事务内身份检查仍拒绝并发重复卡，不留下幽灵版本',async()=>{
  const f=graphFixture();try{
    f.db.exec('DROP INDEX uq_math_method_strategy_key');
    const content=structuredClone(methods[0].content);content.strategy!.key='race-strategy';content.strategy!.links=[];
    const id=randomUUID(),source={origin:'pilot' as const,note:'TEST',evidence:null};
    f.race(()=>f.db.prepare("INSERT INTO math_methods(id,owner_id,scope_id,revision,operation_id,status,content,source,created_at,updated_at) VALUES('racer','teacher','s',1,'racer','candidate',?,?,'now','now')").run(JSON.stringify(content),JSON.stringify(source)));
    await assert.rejects(f.store.writeMethod(id,{operationId:randomUUID(),expectedRevision:0,scopeId:'s',status:'candidate',content,source}),/冲突/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM math_methods').get()!.n,1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM math_method_versions').get()!.n,0);
  }finally{f.db.close();}
});
