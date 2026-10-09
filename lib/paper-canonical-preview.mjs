import { createHash } from 'node:crypto';

export const NORMALIZATION_VERSION = 'math-paper-text-v1';
export const CANONICAL_TABLES = ['question_library_scopes', 'canonical_questions', 'canonical_question_revisions', 'source_documents', 'question_occurrences', 'question_module_links'];
export const PREVIEW_SCOPE = Object.freeze({
  id: 'preview:scope:paper-mapping', code: 'migration-preview:paper-mapping', name: '数学套卷只读映射预览',
  scope_type: 'legacy_private', kind: 'private', ownership_status: 'legacy_unassigned', owner_principal_id: null,
  preview_only: true, authorization_implemented: false, cross_private_merge_allowed: false,
});

export function normalizeQuestionTextV1(value, expectedQuestionNumber) {
  let text = typeof value === 'string' ? value : '';
  text = text.replace(/\r\n?/g, '\n').replace(/[\s\u3000\u00a0]+/gu, ' ').trim();
  // Only remove an unambiguous leading question label, never a decimal or a subpart.
  const prefix = text.match(/^(?:第([0-9０-９]{1,3})题\s*[:：.．、]?\s*|([0-9０-９]{1,3})[.．、](?![0-9０-９])\s*)/u);
  if (prefix) {
    const digits = (prefix[1] || prefix[2]).replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10));
    if (expectedQuestionNumber === undefined || Number(digits) === Number(expectedQuestionNumber)) text = text.slice(prefix[0].length).trim();
  }
  return text;
}
export const hashNormalizedText = text => text ? createHash('sha256').update(text, 'utf8').digest('hex') : null;
const id = (kind, legacy) => `preview:${kind}:${String(legacy)}`;
const present = value => typeof value === 'string' && value.trim().length > 0;
function json(value, type) {
  if (!present(value)) return { value: null, valid: false, missing: true };
  try {
    const result = JSON.parse(value);
    const valid = type === 'array' ? Array.isArray(result) : result !== null && typeof result === 'object' && !Array.isArray(result);
    return { value: result, valid, missing: false };
  } catch { return { value: null, valid: false, missing: false }; }
}
function validRegions(regions) {
  return Array.isArray(regions) && regions.length > 0 && regions.every(r => r && Number.isInteger(r.page) && r.page > 0
    && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]))
    && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001);
}
const visualWords = /如图|图中|图示|图象|图像|示意图|统计图|折线图|柱状图|四棱锥|三棱柱|几何图|as shown|diagram|figure|graph shown/i;
const geometryWords = /GEOMETRY|几何|圆锥曲线|空间向量/i;

function sourceCandidate(paper, objects) {
  const warnings = [];
  if (!present(paper.source_key)) warnings.push('缺少原始来源文件键');
  if (!present(paper.file_hash)) warnings.push('缺少原始文件 hash');
  if (objects && !objects.has(paper.source_key)) warnings.push('原始来源键在本地 R2 映射中不存在');
  if (!present(paper.title)) warnings.push('缺少标题');
  return {
    candidate_id: id('source-document', paper.id), scope: PREVIEW_SCOPE, source_type: 'math_paper', title: paper.title,
    original_filename: paper.original_filename || null, storage_key: paper.source_key || null, file_storage: 'r2',
    file_hash: paper.file_hash || null, mime_type: paper.source_type || null, source_paper_id: String(paper.id),
    math_paper_id: String(paper.id), legacy_source_key: String(paper.id), metadata: { preview_only: true, original_created_at: paper.created_at },
    fields: {
      direct: ['title←papers.title', 'original_filename←papers.original_filename', 'storage_key←papers.source_key', 'file_hash←papers.file_hash', 'math_paper_id←papers.id'],
      converted: ['source_type=math_paper（papers.source_type 是 MIME，不是来源枚举）', 'file_storage=r2', 'mime_type←papers.source_type'],
      unresolved: ['真实所有者/许可与最终 scope', '未来纳入来源层的 created_at，不冒充原上传时间'],
      optional_missing: ['license', 'source_url'],
    },
    mapping_structurally_complete: warnings.length === 0, r2_reference_verified: objects ? objects.has(paper.source_key) : null, warnings,
  };
}

export function buildPaperCanonicalPreview(papers, questions, { objectKeys } = {}) {
  const objects = objectKeys === undefined ? null : new Set(objectKeys);
  const paperMap = new Map(papers.map(p => [String(p.id), p]));
  const sources = papers.map(p => sourceCandidate(p, objects));
  const sourceMap = new Map(sources.map(s => [s.source_paper_id, s]));
  const candidates = questions.map(q => {
    const paper = paperMap.get(String(q.paper_id));
    const sourceDocument = sourceMap.get(String(q.paper_id));
    const classification = json(q.classification, 'object');
    const parsedRegions = json(q.regions, 'array');
    const regions = parsedRegions.valid ? parsedRegions.value : null;
    const regionsValid = validRegions(regions);
    const normalized = normalizeQuestionTextV1(q.question_text, q.question_number);
    const warnings = [], missing = [];
    if (!paper || !sourceDocument?.mapping_structurally_complete) missing.push('来源文档缺失或原件引用不完整');
    if (!normalized) missing.push('空题干（或仅有题号）');
    if (!present(q.image_key)) missing.push('缺少题图键');
    else if (objects && !objects.has(q.image_key)) missing.push('题图键在本地 R2 映射中不存在');
    if (!regionsValid) missing.push('regions 缺失、JSON 无效或裁切坐标无效');
    if (!Number.isInteger(q.question_number) || q.question_number < 1) missing.push('题号无效');
    if (!classification.valid) warnings.push(classification.missing ? '缺少分类；不从标题推断学段' : 'classification JSON 无效');
    if (classification.value?.needs_review) warnings.push('现有 AI 分类标记 needs_review；不是教师确认');
    if (q.status !== 'ready' || present(q.error)) warnings.push(`旧业务状态/错误需复核：${q.status || 'unknown'}${present(q.error) ? '（有错误信息）' : ''}`);
    const visualReasons = [];
    if (visualWords.test(q.question_text || '') || visualWords.test(classification.value?.extracted_question || '')) visualReasons.push('题干/识别文本有图形依赖提示');
    if (geometryWords.test(JSON.stringify({ chapter: classification.value?.chapter, knowledge_points: classification.value?.knowledge_points, question_type: classification.value?.question_type }))) visualReasons.push('现有分类提示几何/空间内容，但分类本身不是图形存在的证明');
    if (regions?.length > 1) visualReasons.push('多个 regions，须核对跨页/多块裁切完整性');
    if (present(q.image_key) && !visualReasons.length) visualReasons.push('有题图，现有字段没有经过人工确认的“无图形且全文完整”证据');
    const requiresVisualReview = visualReasons.length > 0;
    warnings.push(...visualReasons);
    if (/\\n|\\r/.test(q.question_text || '')) warnings.push('题干含字面转义序列，v1 原样保留，不猜测解码');
    if (/(?:选项|不正确|正确的是|\(\s*\)|（\s*）)/u.test(q.question_text || '') && !/A[.．、:：]|A\s*\(/u.test(q.question_text || '')) warnings.push('疑似选择题但未检测到 A 选项，需核对选项完整性');
    if (requiresVisualReview) warnings.push('文字 hash 不包含题图、公式版式或裁切字节，不可直接写为已确认完整身份 hash');
    const baseStatus = missing.length ? 'INCOMPLETE' : warnings.length ? 'NEEDS_REVIEW' : 'READY';
    const ids = { proposed_canonical_id: id('canonical', q.id), proposed_revision_id: id('revision-1', q.id), proposed_occurrence_id: id('occurrence', q.id), proposed_module_link_id: id('module-link', q.id) };
    const locator = { legacy_paper_id: String(q.paper_id), legacy_paper_question_id: String(q.id), question_number: String(q.question_number), regions: regions || [], image_key: q.image_key || null };
    return {
      source: { paper_id: String(q.paper_id), paper_title: paper?.title || null, paper_question_id: String(q.id), question_number: q.question_number, image_key: q.image_key || null, regions, regions_raw: q.regions },
      old_record: { ...q, explanation: undefined }, // Presence only; explanations are not migrated or previewed as revision content.
      content_candidate: { subject: 'math', education_stage: classification.valid ? classification.value.education_stage || null : null,
        education_stage_provenance: 'unconfirmed existing classification', original_text: q.question_text || '', normalized_text: normalized,
        normalized_hash: hashNormalizedText(normalized), normalized_hash_kind: 'text_candidate_only', normalization_version: NORMALIZATION_VERSION,
        current_classification: classification.value, current_classification_raw: q.classification, current_status: q.status },
      identity_candidate: ids, identity_status: baseStatus, base_identity_status: baseStatus,
      requires_visual_review: requiresVisualReview, visual_review_reasons: visualReasons,
      exact_text_hash_match: false, safe_to_merge: false, duplicate_group_hash: null,
      mapping_eligible_after_review: missing.length === 0, missing_required_data: missing, warnings,
      canonical_candidate: { id: ids.proposed_canonical_id, scope_id: PREVIEW_SCOPE.id, subject: 'math', status: 'provisional', current_revision_id: null },
      revision_candidate: { id: ids.proposed_revision_id, canonical_question_id: ids.proposed_canonical_id, revision: 1,
        subject: 'math', education_stage: classification.value?.education_stage || null, original_text: q.question_text || '', normalized_text: normalized,
        normalized_hash: hashNormalizedText(normalized), content_schema_version: 'math-paper-preview-v1', normalization_version: NORMALIZATION_VERSION,
        payload: { stem: q.question_text || '', visual_refs: { image_key: q.image_key || null, regions }, completeness_verified: false },
        identity_status: baseStatus === 'INCOMPLETE' ? 'incomplete' : 'needs_review', change_reason: 'read-only mapping preview', created_by: null,
        insertable_without_review: false, full_content_identity_hash: null },
      occurrence_candidate: { id: ids.proposed_occurrence_id, canonical_question_id: ids.proposed_canonical_id, content_revision_id: ids.proposed_revision_id,
        source_document_id: sourceDocument?.candidate_id || null, source_type: 'math_paper', occurrence_key: `paper_question:${String(q.id)}`,
        question_number: String(q.question_number), page: regionsValid ? Math.min(...regions.map(r => r.page)) : null, source_locator_json: locator,
        image_key: q.image_key || null, raw_text: q.question_text || '', occurrence_hash: null, mapping_status: 'provisional', metadata: { preview_only: true },
        mapping_structurally_complete: missing.length === 0 },
      module_link_candidate: { id: ids.proposed_module_link_id, module_type: 'paper_question', module_record_id: String(q.id),
        legacy_paper_question_id: String(q.id), canonical_question_id: ids.proposed_canonical_id, occurrence_id: ids.proposed_occurrence_id,
        observed_source_hash: createHash('sha256').update(JSON.stringify([q.id, q.paper_id, q.question_number, q.question_text, q.image_key, q.regions, q.classification, q.status, q.revision, q.updated_at])).digest('hex'),
        mapping_revision: 1, mapping_structurally_complete: missing.length === 0 },
      quality: { has_text: present(q.question_text), has_image: present(q.image_key), has_classification: present(q.classification), classification_valid: classification.valid,
        has_regions: present(q.regions), regions_valid: regionsValid, has_explanation: present(q.explanation), regions_count: regions?.length || 0,
        option_markers_present: /A[.．、:：]/u.test(q.question_text || ''), missing_score: missing.length * 100 + warnings.length },
    };
  });
  const grouped = new Map();
  for (const c of candidates) {
    const hash = c.content_candidate.normalized_hash;
    if (hash) { if (!grouped.has(hash)) grouped.set(hash, []); grouped.get(hash).push(c); }
  }
  const duplicateGroups = [...grouped.entries()].filter(([, group]) => group.length > 1).map(([hash, group]) => {
    const paperCounts = new Map();
    for (const c of group) paperCounts.set(c.source.paper_id, (paperCounts.get(c.source.paper_id) || 0) + 1);
    for (const c of group) {
      c.exact_text_hash_match = true; c.duplicate_group_hash = hash;
      // Incomplete data remains INCOMPLETE even if the surviving text matches another row.
      if (c.identity_status !== 'INCOMPLETE') c.identity_status = 'DUPLICATE_CANDIDATE';
      c.warnings.push('文字 hash 重复只表示候选；不共享 proposed canonical ID、不自动合并');
    }
    const payloadsEqual = new Set(group.map(c => c.content_candidate.normalized_text)).size === 1;
    return { hash, candidate_count: group.length, normalized_texts_equal: payloadsEqual,
      within_paper_duplicate: [...paperCounts.values()].some(n => n > 1), cross_paper_duplicate: paperCounts.size > 1,
      safe_to_merge: false, members: group.map(c => ({ ...c.source, text_preview: c.content_candidate.normalized_text.slice(0, 140), canonical_candidate_id: c.identity_candidate.proposed_canonical_id })),
      future_shared_identity_example: { approved_canonical_id: '<人工确认同题且授权后选择的 canonical ID>', occurrences: group.map(c => ({ occurrence_id: c.identity_candidate.proposed_occurrence_id, source_document_id: c.occurrence_candidate.source_document_id })) },
    };
  });
  const count = predicate => candidates.filter(predicate).length;
  const statusCounts = Object.fromEntries(['READY','NEEDS_REVIEW','INCOMPLETE','DUPLICATE_CANDIDATE'].map(s => [s, count(c => c.identity_status === s)]));
  const quality = { with_text: count(c => c.quality.has_text), without_text: count(c => !c.quality.has_text),
    with_image: count(c => c.quality.has_image), without_image: count(c => !c.quality.has_image),
    with_classification: count(c => c.quality.has_classification), without_classification: count(c => !c.quality.has_classification),
    invalid_classification: count(c => c.quality.has_classification && !c.quality.classification_valid),
    with_regions: count(c => c.quality.has_regions), invalid_or_missing_regions: count(c => !c.quality.regions_valid),
    with_explanation: count(c => c.quality.has_explanation), without_explanation: count(c => !c.quality.has_explanation),
    multi_region: count(c => c.quality.regions_count > 1), requires_visual_review: count(c => c.requires_visual_review),
    business_status_counts: Object.fromEntries([...new Set(questions.map(q => q.status || 'unknown'))].sort().map(s => [s, count(c => (c.content_candidate.current_status || 'unknown') === s)])),
  };
  const samples = [];
  const ordinary = candidates.filter(c => !c.quality.option_markers_present && !visualWords.test(c.content_candidate.original_text)).sort((a,b) => a.content_candidate.original_text.length-b.content_candidate.original_text.length)[0];
  const choice = candidates.find(c => c.quality.option_markers_present);
  const visual = candidates.find(c => visualWords.test(c.content_candidate.original_text));
  const least = [...candidates].sort((a,b) => b.quality.missing_score-a.quality.missing_score || a.source.paper_question_id.localeCompare(b.source.paper_question_id))[0];
  for (const [kind, c] of [['ordinary_text_candidate',ordinary],['choice',choice],['visual_dependency',visual],['least_complete',least]]) samples.push({ kind, question_id: c?.source.paper_question_id || null,
    note: kind === 'ordinary_text_candidate' ? '表面为纯文字题；不是已完成人工图像确认' : kind === 'least_complete' && least?.missing_required_data.length === 0 ? '没有缺必填字段的题；此为警告最多、相对最需核对样本，不伪称空题干' : null });
  return {
    report_version: 'paper-canonical-preview-v1', preview_only: true, scope: PREVIEW_SCOPE,
    normalization_version: NORMALIZATION_VERSION, summary: { papers: papers.length, paper_questions: questions.length, ...statusCounts,
      duplicate_candidate_count: count(c => c.exact_text_hash_match), duplicate_group_count: duplicateGroups.length,
      unique_nonempty_text_hash_count: [...grouped.values()].filter(group => group.length === 1).length,
      within_paper_duplicate_group_count: duplicateGroups.filter(g => g.within_paper_duplicate).length, cross_paper_duplicate_group_count: duplicateGroups.filter(g => g.cross_paper_duplicate).length },
    data_quality: quality, per_paper: papers.map(p => ({ paper_id: String(p.id), title: p.title, question_count: count(c => c.source.paper_id === String(p.id)) })),
    source_documents_preview: sources, canonical_preview: candidates, duplicate_groups: duplicateGroups,
    samples, duplicate_sample: duplicateGroups[0] || null,
    unresolved_issues: [
      '预览 scope 不是授权；最终所有者、公共发布许可必须确认，不能跨私人题库合并。',
      '业务 ready 和 AI needs_review=false 不证明原题图/公式/上下文完整；核对题图及所有 regions。',
      '本阶段 normalized_hash 仅为文字候选 SHA-256；未来生产 revision 的完整内容身份 hash 需包含经核验必要图形/上下文及规则版本。',
      '没有逐个校验 R2 原件字节是否符合 papers.file_hash，occurrence_hash 尚未计算；R2 映射存在不等于图片内容核验通过。',
      '所有 preview: ID 都是稳定展示标签，不是最终 UUID；真实写入前需分配 UUID、确定时间与审核者。',
      '现有分类仅展示，不迁入统一分类体系；已有 explanation 仅统计是否存在，不迁移内容。',
    ],
  };
}

export function renderPaperPreviewMarkdown(report) {
  const esc = v => String(v ?? '').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
  const block = value => { const encoded = JSON.stringify(value,null,2); const fence = '`'.repeat(Math.max(3,...[...encoded.matchAll(/`+/g)].map(m=>m[0].length+1))); return `${fence}json\n${encoded}\n${fence}`; };
  const lines = ['# 阶段 2D：数学套卷 Canonical 只读映射预览', '', '只读预览；所有 proposed ID 为展示标签。文字重复不代表同一题，safe_to_merge 始终为 false。', '', '## 总览', '', block(report.summary), '', '## 数据质量', '', block(report.data_quality), '', '| 试卷 | 题数 |', '|---|---|', ...report.per_paper.map(p => `| ${esc(p.title)} | ${p.question_count} |`), '', '## Source document 映射', ''];
  for (const source of report.source_documents_preview) lines.push(`### ${source.title}`, '', block(source), '');
  lines.push('## 全部题目摘要', '', '| 试卷 / 题号 | 预览状态 | 文字 hash 前缀 | 图片复核 | 警告数 |', '|---|---|---|---|---|',
    ...report.canonical_preview.map(c => `| ${esc(c.source.paper_title)} / ${c.source.question_number} | ${c.identity_status} | ${c.content_candidate.normalized_hash?.slice(0,12) || '无'} | ${c.requires_visual_review} | ${c.warnings.length} |`), '', '## 抽样完整映射过程', '');
  for (const sample of report.samples) {
    const c = report.canonical_preview.find(c => c.source.paper_question_id === sample.question_id);
    lines.push(`### ${sample.kind}`, '', sample.note || '', '');
    if (!c) { lines.push('当前数据没有此类样本。', ''); continue; }
    lines.push('old record（解析内容不参与预览）', '', block({ ...c.old_record, classification: undefined, classification_present: c.quality.has_classification, explanation_present: c.quality.has_explanation }), '',
      '→ normalization（原文完整保留在 old record；不删除分值说明、选项、条件或数学符号）', '', block({ normalized_text: c.content_candidate.normalized_text, normalized_hash: c.content_candidate.normalized_hash }), '',
      '→ canonical candidate', '', block({ ...c.canonical_candidate, preview_status: c.identity_status, warnings: c.warnings, missing: c.missing_required_data }), '',
      '→ revision candidate', '', block(c.revision_candidate), '', '→ occurrence candidate', '', block(c.occurrence_candidate), '', '→ module link candidate', '', block(c.module_link_candidate), '');
  }
  lines.push('## 重复候选组', '');
  if (!report.duplicate_groups.length) lines.push('当前真实数据没有同文字 hash 的重复候选组；不伪造真实重复样本。跨卷一题多 occurrence 的能力由合成测试验证。', '');
  for (const group of report.duplicate_groups) lines.push(block(group), '');
  lines.push('## 全部逐题规范文本、ID 和警告', '');
  for (const c of report.canonical_preview) lines.push(`### ${c.source.paper_title} / 第 ${c.source.question_number} 题`, '', block({ source: c.source, normalized_text: c.content_candidate.normalized_text,
    hash: c.content_candidate.normalized_hash, identity_status: c.identity_status, current_status: c.content_candidate.current_status,
    current_classification: { subject: c.content_candidate.current_classification?.subject, education_stage: c.content_candidate.education_stage,
      chapter: c.content_candidate.current_classification?.chapter, needs_review: c.content_candidate.current_classification?.needs_review },
    proposed_ids: c.identity_candidate, exact_text_hash_match: c.exact_text_hash_match, safe_to_merge: c.safe_to_merge, warnings: c.warnings, missing: c.missing_required_data }), '');
  lines.push('## 尚待解决', '', ...report.unresolved_issues.map(issue => '- ' + issue), '', '## 零写入验证', '', block(report.zero_write_verification || { pending: true }), '');
  return lines.join('\n');
}
