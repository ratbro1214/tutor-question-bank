// Pure validation only: no database, storage, network, AI, clock or mutation.
export const DECISION_VERSION = 'canonical-identity-review-v1';
export const REVIEW_STATUSES = Object.freeze(['READY', 'NEEDS_REVIEW', 'INCOMPLETE']);
export const COMPLETENESS_VALUES = Object.freeze([true, false, 'unknown', 'not_applicable']);
export const COMPLETENESS_FIELDS = Object.freeze(['text_complete', 'formula_complete', 'options_complete', 'subquestions_complete', 'visual_complete', 'regions_complete', 'cross_page_complete', 'source_confirmed']);
export const APPLICABILITY_FIELDS = Object.freeze(['formula', 'options', 'subquestions', 'visual', 'cross_page']);
export const MISSING_REASON_CODES = Object.freeze(['text_missing', 'conditions_missing', 'formula_missing', 'options_missing', 'subquestions_missing', 'visual_missing', 'regions_missing', 'cross_page_missing', 'data_unrecoverable']);
const scopeTypes = ['authorized_public', 'teacher_private', 'student_private', 'legacy_private'];
const contentFields = COMPLETENESS_FIELDS.filter(field => field !== 'source_confirmed');
const dependentFields = { formula:'formula_complete', options:'options_complete', subquestions:'subquestions_complete', visual:'visual_complete', cross_page:'cross_page_complete' };
const reasonFields = { text_missing:'text_complete', conditions_missing:'text_complete', formula_missing:'formula_complete', options_missing:'options_complete', subquestions_missing:'subquestions_complete', visual_missing:'visual_complete', regions_missing:'regions_complete', cross_page_missing:'cross_page_complete' };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Returns {valid, errors:[{path,code,message}]}; never changes/infers status or coerces values. */
export function validateCanonicalIdentityDecision(decision) {
  const errors = [];
  const fail = (path, code, message) => errors.push({path, code, message});
  const keys = (object, allowed, required, path) => {
    if (!isObject(object)) { fail(path, 'object_required', '必须是 JSON object'); return false; }
    for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(path ? path+'.'+key : key, 'unknown_field', '不支持的字段；检查拼写或 schema version');
    for (const key of required) if (!Object.hasOwn(object,key)) fail(path ? path+'.'+key : key, 'required', '字段必须显式提供');
    return true;
  };
  const required = ['decision_version','decision_origin','paper_question_id','paper_id','review_status','scope_decision','applicability','review_context',...COMPLETENESS_FIELDS,'missing_reasons','review_notes','reviewed_at'];
  if (!keys(decision,[...required,'reviewer'],required,'')) return {valid:false,errors};
  if (decision.decision_version !== DECISION_VERSION) fail('decision_version','version','不支持的 decision version');
  const draft = decision.decision_origin === 'pending_human';
  if (!['human','pending_human'].includes(decision.decision_origin)) fail('decision_origin','human_required','必须为 human 或未审核草稿 pending_human');
  if (draft) {
    if (decision.review_status !== 'NEEDS_REVIEW') fail('review_status','draft_status','未审核草稿只能 NEEDS_REVIEW');
    if (decision.reviewed_at !== null) fail('reviewed_at','draft_timestamp','未审核草稿必须 reviewed_at=null，不伪造审核时间');
    if (Object.hasOwn(decision,'reviewer')) fail('reviewer','draft_reviewer','未实际审核时不得填写 reviewer');
    for (const field of COMPLETENESS_FIELDS) if (decision[field] !== 'unknown') fail(field,'draft_unconfirmed','未审核草稿完整性必须 unknown');
    for (const field of APPLICABILITY_FIELDS) if (decision.applicability?.[field] !== 'unknown') fail('applicability.'+field,'draft_unconfirmed','草稿不自动决定适用性');
    if (decision.scope_decision?.status !== 'unknown') fail('scope_decision.status','draft_scope','草稿 scope 必须未确认');
    if (!Array.isArray(decision.missing_reasons) || decision.missing_reasons.length) fail('missing_reasons','draft_missing','草稿不自动确认缺失原因');
  }
  for (const key of ['paper_question_id','paper_id']) if (!nonempty(decision[key])) fail(key,'nonempty_string','必须是非空字符串；保留旧 TEXT ID');
  if (!REVIEW_STATUSES.includes(decision.review_status)) fail('review_status','enum','只允许 READY / NEEDS_REVIEW / INCOMPLETE');
  for (const key of COMPLETENESS_FIELDS) if (!COMPLETENESS_VALUES.includes(decision[key])) fail(key,'four_state','只允许 boolean true/false、unknown、not_applicable');
  // Stem, regions and source are mandatory for this paper-question review model.
  for (const key of ['text_complete','regions_complete','source_confirmed']) if (decision[key] === 'not_applicable') fail(key,'always_applicable','套卷题该项始终适用，不能标为 not_applicable');
  if (typeof decision.review_notes !== 'string') fail('review_notes','string','必须是字符串');
  if (Object.hasOwn(decision,'reviewer') && !nonempty(decision.reviewer)) fail('reviewer','nonempty_string','可省略 reviewer；提供时必须为非空人工标识');
  const timestamp = decision.reviewed_at;
  const date = typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) ? new Date(timestamp) : null;
  if (!draft && (!date || !Number.isFinite(date.valueOf()) || ![date.toISOString(),date.toISOString().replace('.000Z','Z')].includes(timestamp))) fail('reviewed_at','utc_timestamp','人工决定必须是有效 UTC ISO 时间；草稿仅允许 null');
  const application = decision.applicability;
  if (keys(application,APPLICABILITY_FIELDS,APPLICABILITY_FIELDS,'applicability')) {
    for (const key of APPLICABILITY_FIELDS) {
      if (![true,false,'unknown'].includes(application[key])) fail('applicability.'+key,'tri_state','适用性只允许 true / false / unknown');
      const field = dependentFields[key], value = decision[field];
      if (application[key] === true && value === 'not_applicable') fail(field,'applicable_cannot_skip','已确认适用，不能跳过');
      if (application[key] === false && value !== 'not_applicable') fail(field,'not_applicable_required','人工确认不适用时，完整性必须显式为 not_applicable');
      if (application[key] === 'unknown' && value === 'not_applicable') fail(field,'applicability_unknown','未知适用性不能伪装成不适用');
    }
  }
  const context = decision.review_context;
  const contextFields = ['multiple_regions','possible_cross_page'];
  if (keys(context,contextFields,contextFields,'review_context')) {
    for (const key of contextFields) if (![true,false,'unknown'].includes(context[key])) fail('review_context.'+key,'tri_state','结构背景只允许 true / false / unknown');
    if (!draft && context.possible_cross_page === true && application?.cross_page !== true) fail('applicability.cross_page','cross_page_required','已记录跨页时跨页核对必须适用');
  }
  const scope = decision.scope_decision;
  const scopeFields = ['status','scope_id','scope_code','scope_type','kind','ownership_status','owner_principal_id','decision_basis','authorization_evidence'];
  if (keys(scope,scopeFields,scopeFields,'scope_decision')) {
    if (!['confirmed','unknown'].includes(scope.status)) fail('scope_decision.status','enum','只允许 confirmed / unknown');
    for (const key of ['scope_id','scope_code','owner_principal_id']) if (scope[key] !== null && !nonempty(scope[key])) fail('scope_decision.'+key,'nullable_string','必须为 null 或非空字符串');
    for (const key of ['decision_basis','authorization_evidence']) if (typeof scope[key] !== 'string') fail('scope_decision.'+key,'string','必须为字符串');
    if (scope.scope_type !== null && !scopeTypes.includes(scope.scope_type)) fail('scope_decision.scope_type','enum','必须沿用现有 scope_type 枚举或为 null');
    if (scope.kind !== null && !['private','shared'].includes(scope.kind)) fail('scope_decision.kind','enum','只允许 private / shared / null');
    if (scope.ownership_status !== null && !['known','legacy_unassigned'].includes(scope.ownership_status)) fail('scope_decision.ownership_status','enum','沿用现有 ownership_status 枚举或为 null');
    if (scope.scope_type !== null && scope.kind !== null && scope.kind !== (scope.scope_type === 'authorized_public' ? 'shared' : 'private')) fail('scope_decision.kind','scope_kind','公共 scope 为 shared；其他 scope 必须为 private');
    if (scope.kind === 'private' && scope.ownership_status === 'known' && !nonempty(scope.owner_principal_id)) fail('scope_decision.owner_principal_id','owner_required','已知私人归属必须指定拥有者');
    if (scope.status === 'confirmed') {
      if (!nonempty(scope.scope_id) && !nonempty(scope.scope_code)) fail('scope_decision','scope_reference','明确 scope 必须有 scope_id 或 scope_code；仅为决定引用，不证明数据库存在');
      if (!scopeTypes.includes(scope.scope_type) || !['private','shared'].includes(scope.kind) || !['known','legacy_unassigned'].includes(scope.ownership_status)) fail('scope_decision','scope_details','确认 scope 必须完整指定类型、kind 和归属状态');
      if (!nonempty(scope.decision_basis)) fail('scope_decision.decision_basis','basis_required','scope 必须有人工决定依据，不能只依据 hash');
      if (scope.scope_type === 'authorized_public' && !nonempty(scope.authorization_evidence)) fail('scope_decision.authorization_evidence','authorization_required','公共 scope 必须有独立的授权/许可依据');
    }
  }
  if (!Array.isArray(decision.missing_reasons)) fail('missing_reasons','array','必须是数组；无明确缺失时使用 []');
  else for (const [index,reason] of decision.missing_reasons.entries()) {
    const path = 'missing_reasons.'+index;
    if (!keys(reason,['code','detail'],['code','detail'],path)) continue;
    if (!MISSING_REASON_CODES.includes(reason.code)) fail(path+'.code','enum','不支持的缺失原因');
    if (!nonempty(reason.detail)) fail(path+'.detail','detail_required','必须描述人工明确确认的缺失事实，不能仅写“不确定”');
    const field = reasonFields[reason.code];
    if (field && [true,'not_applicable'].includes(decision[field])) fail(path,'contradictory_reason','缺失原因与对应完整性确认矛盾');
  }
  if (decision.review_status === 'READY') {
    for (const key of ['text_complete','regions_complete','source_confirmed']) if (decision[key] !== true) fail(key,'ready_requires_true','READY 必须人工确认 true');
    for (const key of APPLICABILITY_FIELDS) {
      if (application?.[key] === 'unknown') fail('applicability.'+key,'ready_applicability','READY 不允许适用性未知');
      if (application?.[key] === true && decision[dependentFields[key]] !== true) fail(dependentFields[key],'ready_requires_true','适用项必须人工确认完整');
    }
    for (const key of COMPLETENESS_FIELDS) if ([false,'unknown'].includes(decision[key])) fail(key,'ready_incomplete','READY 不能包含 false 或 unknown');
    for (const key of contextFields) if (context?.[key] === 'unknown') fail('review_context.'+key,'ready_context','READY 必须明确多区域/跨页背景');
    if (context?.multiple_regions === true && decision.regions_complete !== true) fail('regions_complete','multi_region_confirmation','多 regions 必须确认全部属于本题并完整');
    if ((context?.possible_cross_page === true || application?.cross_page === true) && decision.cross_page_complete !== true) fail('cross_page_complete','cross_page_confirmation','跨页必须人工确认拼接与续文完整');
    if (scope?.status !== 'confirmed') fail('scope_decision.status','ready_scope','READY scope 必须明确');
    if (scope?.kind === 'private' && (scope.ownership_status !== 'known' || !nonempty(scope.owner_principal_id))) fail('scope_decision','ready_private_owner','READY 私人 scope 的归属必须明确；legacy_unassigned 仍需审核');
    if (Array.isArray(decision.missing_reasons) && decision.missing_reasons.length) fail('missing_reasons','ready_no_missing','READY 不得存在缺失原因');
  }
  if (decision.review_status === 'INCOMPLETE') {
    const falseContent = contentFields.some(key => decision[key] === false);
    const explicitReason = Array.isArray(decision.missing_reasons) && decision.missing_reasons.some(reason => isObject(reason) && MISSING_REASON_CODES.includes(reason.code) && nonempty(reason.detail));
    if (!falseContent && !explicitReason) fail('review_status','missing_evidence_required','INCOMPLETE 必须有人工明确的内容 false 或有效 missing reason；未知不是缺失');
  }
  return {valid:errors.length === 0,errors};
}
