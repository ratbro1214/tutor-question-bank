import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { methods as seeds } from '../data/open-math/method-seeds.mjs';
import { juniorMethods } from '../data/open-math/junior-method-seeds.mjs';
const root = new URL('../data/open-math/', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8').replace(/^\uFEFF/, '');
const manifest = JSON.parse(read('manifest.json'));
for (const repo of manifest) for (const file of repo.files) {
  const hash = createHash('sha256').update(readFileSync(new URL(`sources/${repo.id}/${file.path}`, root))).digest('hex');
  if (hash !== file.sha256) throw Error(`Snapshot changed: ${repo.id}/${file.path}`);
}
const map = manifest.find(r => r.id === 'mathmap-cn'), book = manifest.find(r => r.id === 'mathbook');
const link = (repo, path) => `${repo.url}/blob/${repo.commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
function chapter(t) {
  const id=t.id;
  const rules = t.stage === 'stage5' ? [
    [/set_|logic|quantifier/,'集合与逻辑'],[/ineq/,'不等式'],[/deriv/,'导数及其应用'],[/seq_/,'数列'],[/permutation|combination|binomial_thm/,'排列组合与二项式定理'],[/trig|angle/,'三角函数'],[/complex/,'复数'],[/space_vector/,'空间向量'],[/vector/,'平面向量'],[/solid|parallel_space|perp_space/,'立体几何'],[/line_eq|circle_eq|ellipse|hyperbola|conic|eccentricity/,'解析几何'],[/prob|random_var|expect_var|binomial|normal/,'概率与随机变量'],[/sample|regression|independence/,'统计'],[/exp_|log_|power_fn/,'指数与对数函数'],[/fn_/,'函数']
  ] : [
    [/quadratic_fn|quad_fn|quad_coeff/,'二次函数'],[/quadratic|discriminant|vieta/,'一元二次方程'],[/linear_fn|proportional_fn|fn_eq_link/,'一次函数'],[/inverse/,'反比例函数'],[/system/,'二元一次方程组'],[/linear_eq|eq_property/,'一元一次方程'],[/inequality/,'不等式'],[/fraction|frac_/,'分式'],[/sqrt|irrational|real/,'实数与二次根式'],[/rational|absvalue|scinote|approx/,'有理数'],[/polynomial|power_rule|poly_mul|formula|factorize/,'整式与因式分解'],[/fn_|function/,'函数基础'],[/circle|chord|arc_angle|tangent|inscribed_angle|two_circles/,'圆'],[/similar/,'相似三角形'],[/quad|para_judge|diamond|rect_diag/,'四边形'],[/triangle|congruent|isosceles|right_tri|pythagoras|midline|_hl$/,'三角形'],[/coord/,'坐标与变换'],[/transform/,'图形变换'],[/view/,'投影与视图'],[/prob/,'概率'],[/survey|analysis|chart|inference/,'统计'],[/proof|construction|bisector|parallel|line_angle|vertical/,'几何基础与证明']
  ];
  return rules.find(([pattern])=>pattern.test(id))?.[1] || (t.domain === '综合与实践' ? '综合与实践' : '几何基础与证明');
}
const topics = [];
for (const file of readdirSync(new URL('sources/mathmap-cn/data/topics/', root)).sort()) {
  const path=`data/topics/${file}`;
  for (const t of JSON.parse(read(`sources/mathmap-cn/${path}`)).topics) {
    if (!['stage4','stage5'].includes(t.stage)) continue;
    topics.push({ id:t.id, name:t.name, stage:t.stage==='stage5'?'高中':'初中', chapter:chapter(t), description:t.description, goals:t.evidence || [], assessment:(t.assessmentPrompt || '').replaceAll('{{name}}','你'), gradeStart:t.gradeStart, gradeEnd:t.gradeEnd, source:{ repository:map.repo, url:link(map,path), license:map.license, commit:map.commit, path, note:'上游 AI 教学常识初稿，待教研核查；非课标原文。' } });
  }
}
if (new Set(topics.map(t=>t.id)).size !== topics.length) throw Error('Duplicate topic IDs');
const ids = new Set(topics.map(t=>t.id)), edges = new Map();
let omittedEdges = 0;
for (const file of readdirSync(new URL('sources/mathmap-cn/data/dependencies/', root)).sort()) {
  const path=`data/dependencies/${file}`;
  for (const e of JSON.parse(read(`sources/mathmap-cn/${path}`)).dependencies) {
    if (!ids.has(e.prerequisiteId) || !ids.has(e.topicId)) { omittedEdges++; continue; }
    if (e.prerequisiteId === e.topicId) throw Error('Self edge');
    edges.set(`${e.prerequisiteId}:${e.topicId}`, {from:e.prerequisiteId,to:e.topicId,reason:e.reason,strength:e.strength,sourceUrl:link(map,path)});
  }
}
const methods = seeds.map(([name,topicIds,path,section,summary,conditions,steps,limitations,mistakes],i)=> {
  if (topicIds.some(id=>!ids.has(id))) throw Error(`Unknown topic in ${name}`);
  const original=read(`sources/mathbook/${path}`), lines=original.split(/\r?\n/);
  const lineIndex=lines.findIndex(line=>line.includes(section));
  if (lineIndex<0) throw Error(`Missing section: ${name}/${section}`);
  const related=topics.filter(t=>topicIds.includes(t.id));
  return {id:`open-method-${String(i+1).padStart(3,'0')}`,topicIds,stage:'高中',chapter:related[0].chapter,content:{name,summary,conditions,steps,limitations,mistakes,typicalProblems:related.map(t=>t.name),variants:[]},source:{repository:book.repo,commit:book.commit,path,section,line:lineIndex+1,url:link(book,path)+`#L${lineIndex+1}`,license:'MIT',note:'依据开源笔记整理，补充适用条件与局限；待教师核查。'}};
});
for (const [index,[name,topicId,summary,conditions,steps,limitations,mistakes]] of juniorMethods.entries()) {
  const topic=topics.find(t=>t.id===topicId);
  if (!topic) throw Error(`Unknown junior topic: ${topicId}`);
  methods.push({id:`open-junior-method-${String(index+1).padStart(3,'0')}`,topicIds:[topicId],stage:'初中',chapter:topic.chapter,content:{name,summary,conditions,steps,limitations,mistakes,typicalProblems:[topic.name],variants:[]},source:{...topic.source,note:'依据上游知识点与学习目标整理，步骤、条件与局限由项目补充；上游为 AI 初稿，待教师核查。'}});
}
const bundle={version:'2026-10-11.1',sources:manifest.map(({files,...r})=>({...r,fileCount:files.length})),topics,edges:[...edges.values()],methods,omittedEdges,notice:'公共参考资料不等于教师审核结论；方法步骤为整理补充，真实题目关联仍由题库维护。'};
writeFileSync(new URL('catalog.json',root),JSON.stringify(bundle,null,2)+'\n');
process.stdout.write(`${topics.length} topics, ${edges.size} prerequisite edges, ${methods.length} methods; ${omittedEdges} out-of-scope edges omitted\n`);
