import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCanonicalIdentityDecision as validate, DECISION_VERSION, COMPLETENESS_FIELDS } from '../lib/canonical-identity-decision.mjs';

const ready = () => ({
  decision_version:DECISION_VERSION,decision_origin:'human',paper_question_id:'example:question',paper_id:'example:paper',review_status:'READY',
  scope_decision:{status:'confirmed',scope_id:null,scope_code:'example:private',scope_type:'teacher_private',kind:'private',ownership_status:'known',owner_principal_id:'example:owner',decision_basis:'合成人工私人归属决定',authorization_evidence:''},
  applicability:{formula:true,options:false,subquestions:false,visual:false,cross_page:false},
  review_context:{multiple_regions:false,possible_cross_page:false},
  text_complete:true,formula_complete:true,options_complete:'not_applicable',subquestions_complete:'not_applicable',visual_complete:'not_applicable',regions_complete:true,cross_page_complete:'not_applicable',source_confirmed:true,
  missing_reasons:[],review_notes:'仅为测试合成决定',reviewed_at:'2026-10-07T12:00:00Z',
});
const pass = d => assert.deepEqual(validate(d),{valid:true,errors:[]});
const fail = (d,path) => { const result=validate(d); assert.equal(result.valid,false); if(path) assert.ok(result.errors.some(e=>e.path===path),JSON.stringify(result.errors)); };
const needs = () => {
  const d=ready(); d.review_status='NEEDS_REVIEW';
  for(const key of COMPLETENESS_FIELDS) d[key]='unknown';
  for(const key of Object.keys(d.applicability)) d.applicability[key]='unknown';
  for(const key of Object.keys(d.review_context)) d.review_context[key]='unknown';
  d.scope_decision={status:'unknown',scope_id:null,scope_code:null,scope_type:null,kind:null,ownership_status:null,owner_principal_id:null,decision_basis:'',authorization_evidence:''};
  return d;
};

test('READY ordinary single-region synthetic question',()=>pass(ready()));
test('READY cross-page question confirms regions and stitching',()=>{
  const d=ready(); d.review_context={multiple_regions:true,possible_cross_page:true}; d.applicability.cross_page=true; d.cross_page_complete=true; pass(d);
});
test('READY visual question explicitly confirms visual completeness',()=>{const d=ready();d.applicability.visual=true;d.visual_complete=true;pass(d);});
test('READY choice question explicitly confirms all options',()=>{const d=ready();d.applicability.options=true;d.options_complete=true;pass(d);});
test('READY multiple-subquestion question explicitly confirms all subquestions',()=>{const d=ready();d.applicability.subquestions=true;d.subquestions_complete=true;pass(d);});
test('READY applicable options with unknown completeness fails',()=>{const d=ready();d.applicability.options=true;d.options_complete='unknown';fail(d,'options_complete');});
test('READY regions_complete unknown fails',()=>{const d=ready();d.regions_complete='unknown';fail(d,'regions_complete');});
test('READY missing scope fails',()=>{const d=ready();delete d.scope_decision;fail(d,'scope_decision');});
test('READY source_confirmed false fails',()=>{const d=ready();d.source_confirmed=false;fail(d,'source_confirmed');});
test('INCOMPLETE without explicit false/reason fails',()=>{const d=needs();d.review_status='INCOMPLETE';fail(d,'review_status');});
test('NEEDS_REVIEW unknown values pass unchanged',()=>{const d=needs();const snapshot=structuredClone(d);pass(d);assert.deepEqual(d,snapshot);});
test('INCOMPLETE explicitly false content passes; optional detailed missing reason passes',()=>{
  const d=needs();d.review_status='INCOMPLETE';d.text_complete=false;pass(d);d.missing_reasons=[{code:'conditions_missing',detail:'合成条件行明确缺失'}];pass(d);
});
test('INCOMPLETE unrecoverable-data reason passes with unknown completeness',()=>{
  const d=needs();d.review_status='INCOMPLETE';d.missing_reasons=[{code:'data_unrecoverable',detail:'合成原件已丢失，现有材料不足以恢复'}];pass(d);
});
test('source false and unknown scope alone cannot prove INCOMPLETE',()=>{const d=needs();d.review_status='INCOMPLETE';d.source_confirmed=false;fail(d,'review_status');});
test('multi-regions/cross-page with unknown content remains NEEDS_REVIEW',()=>{
  const d=needs();d.review_context={multiple_regions:true,possible_cross_page:true};d.applicability.cross_page=true;pass(d);
});
test('same-page multiple regions can be READY without cross-page applicability',()=>{const d=ready();d.review_context.multiple_regions=true;pass(d);});
test('READY cross-page completeness unknown and not_applicable fail',()=>{
  for(const value of ['unknown','not_applicable']) {const d=ready();d.review_context.possible_cross_page=true;d.applicability.cross_page=true;d.cross_page_complete=value;fail(d,'cross_page_complete');}
});
test('recorded cross-page cannot bypass applicable cross-page checks',()=>{const d=ready();d.review_context.possible_cross_page=true;fail(d,'applicability.cross_page');});
test('not_applicable requires confirmed non-applicability; cannot skip unknown or applicable checks',()=>{
  for(const value of [true,'unknown']) {const d=needs();d.applicability.options=value;d.options_complete='not_applicable';fail(d,'options_complete');}
  const d=ready();d.options_complete=true;fail(d,'options_complete');
});
test('stem, regions, source never allow not_applicable',()=>{for(const key of ['text_complete','regions_complete','source_confirmed']) {const d=needs();d[key]='not_applicable';fail(d,key);}});
test('READY unknown applicability/background/unknown scope are invalid',()=>{
  let d=ready();d.applicability.visual='unknown';fail(d,'applicability.visual');
  d=ready();d.review_context.multiple_regions='unknown';fail(d,'review_context.multiple_regions');
  d=ready();d.scope_decision.status='unknown';fail(d,'scope_decision.status');
});
test('private scope known owner is mandatory for READY; unassigned may remain NEEDS_REVIEW',()=>{
  const d=ready();d.scope_decision.ownership_status='legacy_unassigned';d.scope_decision.owner_principal_id=null;fail(d,'scope_decision');
  d.review_status='NEEDS_REVIEW';pass(d);
  d.scope_decision.ownership_status='known';fail(d,'scope_decision.owner_principal_id');
});
test('scope type/kind follows existing schema and explicit scope reference/basis is required',()=>{
  let d=ready();d.scope_decision.kind='shared';fail(d,'scope_decision.kind');
  d=ready();d.scope_decision.scope_code=null;fail(d,'scope_decision');
  d=ready();d.scope_decision.decision_basis='';fail(d,'scope_decision.decision_basis');
});
test('public scope requires independent authorization evidence; matching hash is not a field or permission action',()=>{
  const d=ready();d.scope_decision.scope_type='authorized_public';d.scope_decision.kind='shared';d.scope_decision.owner_principal_id=null;
  fail(d,'scope_decision.authorization_evidence');d.scope_decision.authorization_evidence='合成许可编号 EXAMPLE-ONLY';pass(d);
  d.normalized_hash='matching';fail(d,'normalized_hash');
});
test('missing reason cannot contradict completeness or contain invalid/empty reasons',()=>{
  let d=ready();d.review_status='INCOMPLETE';d.missing_reasons=[{code:'text_missing',detail:'合成题干缺失'}];fail(d,'missing_reasons.0');
  d=needs();d.review_status='INCOMPLETE';d.missing_reasons=[{code:'uncertain',detail:'不确定'}];fail(d,'missing_reasons.0.code');
  d=needs();d.review_status='INCOMPLETE';d.missing_reasons=[{code:'data_unrecoverable',detail:''}];fail(d,'missing_reasons.0.detail');
});
test('READY cannot retain explicit missing reasons',()=>{const d=ready();d.missing_reasons=[{code:'data_unrecoverable',detail:'合成缺失'}];fail(d,'missing_reasons');});
test('strict four-state types, version, human origin and statuses reject coerced/automatic input',()=>{
  for(const value of ['true','false',null,0]) {const d=needs();d.text_complete=value;fail(d,'text_complete');}
  let d=ready();d.decision_origin='program';fail(d,'decision_origin');
  d=ready();d.review_status='DUPLICATE_CANDIDATE';fail(d,'review_status');
  d=ready();d.decision_version='v0';fail(d,'decision_version');
});
test('timestamp must be real UTC ISO, missing fields and typos fail; reviewer stays optional',()=>{
  for(const value of ['', '2026-02-30T12:00:00Z', '2026-10-07',null]) {const d=ready();d.reviewed_at=value;fail(d,'reviewed_at');}
  const d=ready();d.reviewed_at='2026-10-07T12:00:00.123Z';d.reviewer='example:human';pass(d);
  delete d.text_complete;d.text_complet=true;fail(d,'text_complete');
  fail(null);fail([]);
});
test('example file contains only synthetic IDs and each example validates',async()=>{
  const wrapper=JSON.parse(await readFile(new URL('../../outputs/阶段2E-2-canonical-identity-decisions.example.json',import.meta.url),'utf8'));
  assert.equal(wrapper.example_only,true);assert.equal(wrapper.schema_version,DECISION_VERSION);
  for(const d of wrapper.decisions) {assert.match(d.paper_question_id,/^example:/);assert.match(d.paper_id,/^example:/);pass(d);}
});
test('validator has no imports, database/storage/network/AI calls or implicit clock',async()=>{
  const source=await readFile(new URL('../lib/canonical-identity-decision.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/^import\s|\b(?:fetch|DatabaseSync|writeFile|Date\.now)\s*\(|\.exec\s*\(|\.run\s*\(/m);
});
