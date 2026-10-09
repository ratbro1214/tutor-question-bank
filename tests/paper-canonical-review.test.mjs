import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaperCanonicalReview as build, detectReviewTextMarkers as markers, renderPaperReviewMarkdown } from '../lib/paper-canonical-review.mjs';

const paper = { id:'p',title:'合成测试卷',source_key:'source',original_filename:'test.pdf',file_hash:'a'.repeat(64),source_type:'application/pdf' };
const region = page => ({page,x:0,y:0,width:0.5,height:0.5});
const question = (id, extra={}) => ({id,paper_id:'p',question_number:1,question_text:'1. 求 x²=4 的根',status:'ready',image_key:'image',explanation:'{}',classification:'{}',regions:JSON.stringify([region(1)]),...extra});

test('literal options/subquestions produce evidence; absence and incomplete marker sequences remain unknown', () => {
  assert.equal(markers('A.1 B.2 C.3 D.4').has_options,true);
  assert.equal(markers('A.1').has_options,'unknown');
  assert.equal(markers('求 x').has_options,'unknown');
  assert.equal(markers('(1) 求 x\n（2）证明').has_subquestions,true);
  assert.equal(markers('f(1)=4，f(2)=8').has_subquestions,'unknown');
  assert.equal(markers('求函数图像性质').visual_literal_markers.length,0);
});
test('multi-region same page differs from cross-page and never alone implies INCOMPLETE', () => {
  const report=build([paper],[question('same',{regions:JSON.stringify([region(1),region(1)])}),question('cross',{question_text:'1. 求 x²=8 的根',regions:JSON.stringify([region(2),region(3)])})]);
  const same=report.items.find(i=>i.paper_question_id==='same'),cross=report.items.find(i=>i.paper_question_id==='cross');
  assert.equal(same.multiple_regions,true); assert.equal(same.possible_cross_page,false);
  assert.equal(cross.possible_cross_page,true); assert.deepEqual(cross.region_pages_in_stored_order,[2,3]);
  assert.equal(same.identity_status,'NEEDS_REVIEW'); assert.equal(cross.identity_status,'NEEDS_REVIEW');
  assert.equal(same.human_confirmation.final_identity_complete,'needs_review');
});
test('priority order is multi-region, explicit image evidence, then remaining ordinary; geometry classification alone is not proof', () => {
  const report=build([paper],[question('ordinary',{classification:'{"chapter":{"name":"立体几何"}}'}),question('visual',{question_text:'1. 如图，求 x'}),question('multi',{regions:JSON.stringify([region(1),region(2)])})]);
  assert.deepEqual(report.items.map(i=>i.paper_question_id),['multi','visual','ordinary']);
  assert.deepEqual(report.items.map(i=>i.priority_group),[1,2,3]);
  assert.equal(report.items[2].visual_dependency,'unknown');
  for(const i of report.items) assert.equal(i.requires_visual_review,true);
});
test('invalid/missing regions and reference evidence remain visible without invented pages or file checks', () => {
  const report=build([paper],[question('invalid',{regions:'bad',image_key:''}),question('bounds',{regions:JSON.stringify([{...region(81),width:2}])})],{objectKeys:['source']});
  const invalid=report.items.find(i=>i.paper_question_id==='invalid');
  assert.equal(invalid.region_count,'unknown'); assert.equal(invalid.multiple_regions,'unknown');
  assert.equal(invalid.possible_cross_page,'unknown'); assert.equal(invalid.has_image,false);
  assert.ok(invalid.reference_anomalies.length); assert.equal(report.summary.reference_anomaly_questions,2);
  assert.equal(invalid.source_file_reference.mapping_count,'unknown');
});
test('complete stored fields, raw text/classification, hashes and read-only checklist survive render', () => {
  const q=question('uuid',{question_text:'1． (1) 条件 x² ≥ 4\n(2) 求 y',classification:'{"needs_review":false}'});
  const report=build([paper],[q]); const i=report.items[0];
  assert.equal(i.question_text,q.question_text); assert.equal(i.regions_raw,q.regions); assert.equal(i.classification_raw,q.classification);
  assert.equal(i.normalized_text_hash.length,64); assert.equal(i.has_explanation,true);
  assert.equal(i.has_subquestions,true);
  assert.equal(report.read_only,true);
  const markdown=renderPaperReviewMarkdown(report);
  assert.match(markdown,/\[ \] 是否遗漏选项或小问/); assert.match(markdown,/unknown/); assert.match(markdown,/x² ≥ 4/);
});
