import test from 'node:test';
import assert from 'node:assert/strict';
import { selectReviewRepresentatives, createPendingIdentityDecision, REQUIRED_CROSS_PAGE_IDS, renderReviewPackageMarkdown } from '../lib/paper-identity-review-package.mjs';
import { validateCanonicalIdentityDecision as validate, COMPLETENESS_FIELDS } from '../lib/canonical-identity-decision.mjs';

const item=(id,extra={})=>({paper_question_id:id,paper_id:'synthetic:paper',paper_title:'Synthetic only',question_number:1,question_text:'普通合成题',region_count:1,regions_valid:true,multiple_regions:false,possible_cross_page:false,requires_visual_review:true,has_options:'unknown',has_subquestions:'unknown',priority_group:3,visual_dependency_evidence:[],...extra});
const pool=()=>[...REQUIRED_CROSS_PAGE_IDS.map(id=>item(id,{region_count:2,multiple_regions:true,possible_cross_page:true,priority_group:1})),item('short',{question_text:'x'}),item('choice',{has_options:true}),item('visual',{priority_group:2,visual_dependency_evidence:['如图']}),item('sub',{has_subquestions:true}),item('ordinary',{question_number:12}),item('unused',{question_number:20})];
test('deterministic selection includes all five required cross-page IDs and five distinct structural representatives',()=>{
  const selected=selectReviewRepresentatives(pool());assert.equal(selected.length,10);assert.equal(new Set(selected.map(i=>i.paper_question_id)).size,10);
  assert.deepEqual(selected.slice(0,5).map(i=>i.paper_question_id),REQUIRED_CROSS_PAGE_IDS);
  assert.deepEqual(selected.slice(5).map(i=>i.paper_question_id),['short','choice','visual','sub','ordinary']);
  assert.deepEqual(selectReviewRepresentatives(pool().reverse()),selected);
});
test('mandatory source mismatch fails rather than silently choosing another record',()=>{
  assert.throws(()=>selectReviewRepresentatives(pool().slice(1)),/Required cross-page/);
  const changed=pool();changed[0].possible_cross_page=false;assert.throws(()=>selectReviewRepresentatives(changed),/changed/);
});
test('all ten drafts validate without inferred completeness, applicability, reviewer or timestamp',()=>{
  for(const selected of selectReviewRepresentatives(pool())) {
    const d=createPendingIdentityDecision(selected);assert.deepEqual(validate(d),{valid:true,errors:[]});
    for(const field of COMPLETENESS_FIELDS) assert.equal(d[field],'unknown');
    assert.ok(Object.values(d.applicability).every(v=>v==='unknown'));assert.equal(d.reviewed_at,null);assert.equal(Object.hasOwn(d,'reviewer'),false);
    assert.equal(d.review_status,'NEEDS_REVIEW');assert.equal(d.scope_decision.status,'unknown');
  }
});
test('pending_human cannot silently become READY/INCOMPLETE or claim any confirmed completeness',()=>{
  for(const status of ['READY','INCOMPLETE']) {const d=createPendingIdentityDecision(item('x'));d.review_status=status;assert.equal(validate(d).valid,false);}
  for(const value of [true,false,'not_applicable']) {const d=createPendingIdentityDecision(item('x'));d.options_complete=value;assert.equal(validate(d).valid,false);}
});
test('pending_human cannot claim reviewer, actual time, scope, applicability or missing reasons',()=>{
  for(const patch of [{reviewer:'someone'},{reviewed_at:'2026-10-07T12:00:00Z'},{missing_reasons:[{code:'text_missing',detail:'unreviewed'}]}]) {
    const d={...createPendingIdentityDecision(item('x')),...patch};assert.equal(validate(d).valid,false);
  }
  let d=createPendingIdentityDecision(item('x'));d.applicability.cross_page=true;assert.equal(validate(d).valid,false);
  d=createPendingIdentityDecision(item('x'));d.scope_decision.status='confirmed';assert.equal(validate(d).valid,false);
});
test('human READY still requires real reviewed_at; draft extension never relaxes final decisions',()=>{
  const d=createPendingIdentityDecision(item('x'));d.decision_origin='human';d.review_status='READY';assert.equal(validate(d).valid,false);
  assert.ok(validate(d).errors.some(e=>e.path==='reviewed_at'));
});
test('Markdown uses relative artifact links and preserves original metadata and auxiliary explanation',()=>{
  const base=item('x',{region_pages_in_stored_order:[1],regions:[{page:1,x:0,y:0,width:1,height:1}],regions_raw:'raw metadata',reference_anomalies:[],classification:{},explanation:{helper:'辅助'},explanation_raw:'auxiliary-only'});
  const ready={...base,pending_decision:createPendingIdentityDecision(base),artifacts:{current_image:{path:'review-artifacts/current/x.jpg'},source_file:{path:'review-artifacts/source/x.pdf'},region_previews:[{page:1,original_region_index:0,metadata:base.regions[0],path:'review-artifacts/regions/x.png'}]}};
  const md=renderReviewPackageMarkdown({items:[ready],summary:{},verification:{}});
  assert.match(md,/!\[当前题图\]\(review-artifacts\/current\/x.jpg\)/);assert.match(md,/raw metadata/);assert.match(md,/auxiliary-only/);assert.match(md,/\[ \] scope 确认/);
});
