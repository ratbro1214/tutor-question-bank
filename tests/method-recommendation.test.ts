import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveMethods, validateRecommendations } from '../lib/method-recommendation';
import { methodContentSchema, type GraphMethod } from '../lib/knowledge-graph';
import { openMathCatalog } from '../lib/open-math';
const content = methodContentSchema.parse({ name: '因式分解法', summary: '分解后使用零乘积性质', typicalProblems: [], conditions: ['方程能化为多项式乘积为零'], steps: ['移项', '分解', '分别令因式为零'], limitations: ['未必能方便分解'], mistakes: [], variants: [], signals: ['积为零'], strategies: ['化归与转化'], knowledgePoints: ['零乘积性质'], problemTypes: ['一元二次方程'] });
const method: GraphMethod = { id:'m', scope_id:'s', revision:2, status:'approved', content, source:{origin:'manual',note:'教师审核',evidence:null}, evidenceValid:true, merged_into:null, updated_at:'' };
const raw = () => ({ features:{knowledge:['一元二次方程'], structure:'多项式方程', constraints:'实数', goal:'求根'}, items:[{methodId:'m',methodRevision:2,verdict:'preferred',reason:'易于分解',conditions:'积为零',evidence:'x^2-5x+6=0',efficiency:'较快',generality:'有局限',teachingValue:'观察结构',steps:['(x-2)(x-3)=0'],variation:'改变常数后需重新检查'}] });
test('候选检索排除未审核、无效来源及已合并方法', () => {
  assert.deepEqual(retrieveMethods('x^2-5x+6=0', [method, {...method,id:'candidate',status:'candidate'}, {...method,id:'invalid',evidenceValid:false}, {...method,id:'merged',merged_into:'m'}]).map(m=>m.id), ['m']);
});
test('推荐拒绝编造方法、过期版本、重复结果及候选状态，引用不匹配降级为人工判断', () => {
  assert.equal(validateRecommendations(raw(), [method], 'x^2-5x+6=0').items[0].verdict, 'preferred');
  for (const patch of [{methodId:'invented'}, {methodRevision:1}]) { const r=raw(); Object.assign(r.items[0],patch); assert.throws(()=>validateRecommendations(r,[method],'x^2-5x+6=0')); }
  const r=raw();r.items.push({...r.items[0]});assert.throws(()=>validateRecommendations(r,[method],'x^2-5x+6=0'));
  assert.throws(()=>validateRecommendations(raw(),[{...method,status:'candidate'}],'x^2-5x+6=0'));
  assert.equal(validateRecommendations(raw(),[method],'另一题').items[0].verdict,'uncertain');
});
test('旧方法卡保持兼容，四类概念独立保存，对数换底卡包含思考过程与公式', () => {
  assert.deepEqual(methodContentSchema.parse(content).strategies,['化归与转化']);
  const old = {...content}; delete old.signals;delete old.strategies;assert.doesNotThrow(()=>methodContentSchema.parse(old));
  const log=openMathCatalog.methods.find(m=>m.content.name==='对数换底法')!.content;
  assert.ok(log.signals?.length);assert.ok(log.motivation);assert.ok(log.formulas?.length);assert.deepEqual(log.problemTypes,['对数表达式化简','对数方程求解']);
});
