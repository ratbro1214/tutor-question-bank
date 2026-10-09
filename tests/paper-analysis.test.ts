import test from 'node:test';
import assert from 'node:assert/strict';
import { processPaperAnalysis } from '../lib/paper-analysis';
import type { Classification } from '../lib/classification';
import { emptyExplanation } from '../lib/question-explanation';

const classification: Classification = {
 schema_version:'1.0',taxonomy_version:'cn-senior-math-1.0',subject:'高中数学',education_stage:'高中',extracted_question:'求复数 z 的模。',
 chapter:{code:'fixture',name:'复数'},knowledge_points:[{code:'fixture',name:'复数的模'}],methods:[],
 question_type:'求值',difficulty:'基础',confidence:0.9,needs_review:false,review_reasons:[],classification_notes:'考查复数的模。',
};
test('classify operation returns only classification and never invokes explanation generation', async () => {
 let calls=0;
 const result=await processPaperAnalysis({mode:'classify',classification:null,educationStage:'高中',classify:async()=>{calls++;return classification;},explain:async()=>{throw Error('Must not solve');}});
 assert.equal(calls,1);assert.equal(result.classification,classification);assert.equal(result.content,null);
});
test('saved classification is reused without another AI request', async () => {
 const result=await processPaperAnalysis({mode:'classify',classification,educationStage:'高中',classify:async()=>{throw Error('Must reuse');},explain:async()=>{throw Error('Must not solve');}});
 assert.equal(result.classification,classification);assert.equal(result.content,null);
});
test('optional explanation reuses saved classification and only calls the solver once', async () => {
 let calls=0;
 const result=await processPaperAnalysis({mode:'explain',classification,educationStage:'高中',classify:async()=>{throw Error('Must reuse');},explain:async c=>{assert.equal(c,classification);calls++;return emptyExplanation;}});
 assert.equal(calls,1);assert.equal(result.content,emptyExplanation);
});
test('education stage changes force reclassification before the optional solver', async () => {
 const order:string[]=[];
 const junior={...classification,education_stage:'初中' as const};
 const result=await processPaperAnalysis({mode:'explain',classification,educationStage:'初中',classify:async()=>{order.push('classify');return junior;},explain:async c=>{assert.equal(c.education_stage,'初中');order.push('explain');return emptyExplanation;}});
 assert.deepEqual(order,['classify','explain']);assert.equal(result.classification,junior);
});
test('classification failure never starts explanation generation', async () => {
 await assert.rejects(processPaperAnalysis({mode:'explain',classification:null,educationStage:'高中',classify:async()=>{throw Error('Classification failed');},explain:async()=>{throw Error('Must not solve');}}), /Classification failed/);
});
