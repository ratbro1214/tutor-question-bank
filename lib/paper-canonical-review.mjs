import { buildPaperCanonicalPreview } from './paper-canonical-preview.mjs';

const present = value => typeof value === 'string' && value.trim().length > 0;
const groupNames = { 1: '多 regions 题：优先审核', 2: '有明确图片字面提示或定位异常的题', 3: '剩余普通题：仅为审核顺序，不证明无图' };
const checklist = ['多个 region 是否共同构成一道完整题，拼接顺序是否正确', '是否存在跨页，以及页码、续文是否齐全', '是否遗漏图形、公式或表格', '是否遗漏条件', '是否遗漏选项或小问'];

// Only detect literal markers in stored text. Absence is not evidence of no options/subquestions.
export function detectReviewTextMarkers(text) {
  text = typeof text === 'string' ? text : '';
  const options = [...new Set([...text.matchAll(/(?:^|\s)([A-DＡ-Ｄ])[.．、:：]\s*/gu)].map(m => m[1]))];
  const subquestions = [...new Set([...text.matchAll(/(?:^\s*[0-9]{1,3}[.．、]\s*|^|[\r\n;；])\s*[(（]([1-9][0-9]?)[)）]/gu)].map(m => m[1]))];
  const visual = [...new Set(text.match(/如图|图中|图示|图象如|图像如|示意图|统计图|折线图|柱状图|as shown|diagram|figure|graph shown/gi) || [])];
  return { has_options: options.length >= 2 ? true : 'unknown', option_markers: options,
    has_subquestions: subquestions.length >= 2 ? true : 'unknown', subquestion_markers: subquestions,
    visual_literal_markers: visual, note: 'true 仅表示有明确字面标记，不证明选项/小问完整；缺少标记时为 unknown。' };
}

export function buildPaperCanonicalReview(papers, questions, options = {}) {
  const preview = buildPaperCanonicalPreview(papers, questions, options);
  const paperMap = new Map(papers.map(p => [String(p.id), p]));
  const references = new Map();
  for (const ref of options.objectReferences || []) references.set(ref.key, [...(references.get(ref.key) || []), ref]);
  const reference = key => {
    const refs = references.get(key);
    return { storage_key: key || null, api_path: present(key) ? '/api/images/' + encodeURIComponent(key) : null,
      r2_mapping_exists: options.objectKeys ? options.objectKeys.includes(key) : 'unknown',
      mapping_count: refs ? refs.length : 'unknown', local_objects: refs || [],
      verification_scope: '本地持久化 R2；API 相对路径仅展示，未请求，未启动服务；未确认图像内容。' };
  };
  const items = preview.canonical_preview.map(candidate => {
    const q = candidate.old_record, paper = paperMap.get(String(q.paper_id));
    const markers = detectReviewTextMarkers(q.question_text);
    const extractedMarkers = detectReviewTextMarkers(candidate.content_candidate.current_classification?.extracted_question);
    const parsed = candidate.source.regions;
    const validPages = Array.isArray(parsed) && parsed.length > 0 && parsed.every(r => r && Number.isInteger(r.page) && r.page > 0 && r.page <= 80);
    const pages = validPages ? [...new Set(parsed.map(r => r.page))].sort((a,b) => a-b) : [];
    const multiple = Array.isArray(parsed) ? parsed.length > 1 : 'unknown';
    // Follow cropRegionSchema limits/tolerance, independently from the stricter 2D validator.
    const regionsValid = validPages && parsed.length <= 20 && parsed.every(r => ['x','y','width','height'].every(k => Number.isFinite(r[k]))
      && r.x >= 0 && r.y >= 0 && r.x <= 1 && r.y <= 1 && r.width > 0 && r.width <= 1 && r.height > 0 && r.height <= 1
      && r.x + r.width <= 1.001 && r.y + r.height <= 1.001);
    const image = reference(q.image_key), source = reference(paper?.source_key);
    const anomalies = [];
    if (!regionsValid) anomalies.push('regions 不满足现有 cropRegionSchema / 数量约束');
    if (!paper) anomalies.push('papers 来源记录不存在');
    for (const [name, ref] of [['题图',image],['原文件',source]]) {
      if (!present(ref.storage_key)) anomalies.push(name + '引用缺失');
      else if (ref.r2_mapping_exists === false) anomalies.push(name + '键在本地 R2 映射中不存在');
      if (typeof ref.mapping_count === 'number' && ref.mapping_count > 1) anomalies.push(name + '键有多个映射，不能唯一定位');
      for (const object of ref.local_objects) {
        if (!object.blob_exists) anomalies.push(name + '映射指向的本地 blob 不存在');
        if (object.blob_path_count > 1) anomalies.push(name + 'blob 有多个路径，需核对');
        if (object.size_matches === false) anomalies.push(name + 'blob 大小与映射不符');
      }
    }
    const visualMarkers = [...new Set([...markers.visual_literal_markers, ...extractedMarkers.visual_literal_markers])];
    const group = multiple === true ? 1 : visualMarkers.length || anomalies.length ? 2 : 3;
    return {
      paper_question_id: String(q.id), paper_id: String(q.paper_id), paper_title: paper?.title || null,
      question_number: q.question_number ?? null, business_status: q.status || 'unknown', business_error: q.error || null,
      identity_status: candidate.identity_status, content_completeness: 'needs_review',
      question_text: q.question_text || '', normalized_text: candidate.content_candidate.normalized_text,
      normalized_text_hash: candidate.content_candidate.normalized_hash, hash_kind: 'text_candidate_only',
      classification: candidate.content_candidate.current_classification, classification_raw: q.classification ?? null,
      classification_valid: candidate.quality.classification_valid, classification_provenance: '原有分类，仅展示，不作为人工审核结论',
      region_count: Array.isArray(parsed) ? parsed.length : 'unknown', regions: parsed, regions_raw: q.regions ?? null,
      regions_valid: regionsValid, region_pages_in_stored_order: validPages ? parsed.map(r => r.page) : null,
      distinct_region_pages: pages, multiple_regions: multiple, possible_cross_page: validPages ? pages.length > 1 : 'unknown',
      cross_page_basis: '仅根据已记录 regions 的不同 page 判断；false 不排除裁切漏掉未记录的续页',
      image_file_reference: image, source_file_reference: { ...source, original_filename: paper?.original_filename || null, file_hash: paper?.file_hash || null },
      has_image: present(q.image_key), has_image_basis: '数据库有非空 image_key；对象存在与内容完整性另行展示',
      has_explanation: candidate.quality.has_explanation, has_explanation_basis: '非空 explanation，仅统计，不迁移、不确认解析正确性',
      has_options: markers.has_options, has_subquestions: markers.has_subquestions,
      marker_evidence: markers, extracted_visual_marker_evidence: extractedMarkers.visual_literal_markers,
      requires_visual_review: true, visual_dependency: visualMarkers.length ? 'needs_review' : 'unknown',
      visual_dependency_evidence: visualMarkers, visual_review_reason: '历史题图/文本没有经人工确认的内容完整性证据；有图键不等于存在必要图形。',
      priority_group: group, priority_reason: group === 1 ? '多个 regions，不能据此判为 INCOMPLETE' : group === 2 ? '明确字面图像提示或结构/引用异常，需要核对' : '没有检测到明确提示，仍须人工确认',
      reference_anomalies: anomalies, review_checklist: checklist,
      human_confirmation: { all_regions_form_one_question: 'unknown', continuation_complete: 'unknown', figures_complete: 'unknown',
        conditions_complete: 'unknown', options_complete: 'unknown', subquestions_complete: 'unknown', final_identity_complete: 'needs_review' },
    };
  }).sort((a,b) => a.priority_group-b.priority_group || a.paper_id.localeCompare(b.paper_id) || (a.question_number ?? 0)-(b.question_number ?? 0) || a.paper_question_id.localeCompare(b.paper_question_id));
  const tally = key => Object.fromEntries([true,false,'unknown'].map(value => [String(value), items.filter(i => i[key] === value).length]));
  return { report_version: 'paper-canonical-human-review-v1', stage: '2E-1', read_only: true, normalization_version: preview.normalization_version,
    field_policy: 'true/false 为指定结构或字面规则结果，unknown 为证据不足；所有内容完整性确认均 needs_review/unknown。分组不是审核通过。',
    audit: { files: ['db/schema.ts','lib/paper.ts','lib/pdf-browser.ts','lib/paper-server.ts','components/paper-workbench.tsx','app/api/papers/[id]/questions/route.ts','app/api/images/[...key]/route.ts','scripts/preview-paper-canonical-mapping.mjs','lib/paper-canonical-preview.mjs'],
      findings: ['regions 使用 page 与归一化坐标；单 region 页码范围 1..80，边界容差 0.001，题目最多 20 regions。', '题图按 regions 原数组顺序裁切、去除空白并拼接；存在 regions 不证明裁切完整。', '图片与原文件通过 R2 键及现有 /api/images/<编码键> 引用；不访问 API。', '复用 2D SELECT 白名单、readOnly 连接和数据库/WAL/R2 前后指纹核验。'] },
    summary: { papers: papers.length, paper_questions: items.length, business_status_counts: preview.data_quality.business_status_counts,
      identity_status_counts: Object.fromEntries(['READY','NEEDS_REVIEW','INCOMPLETE','DUPLICATE_CANDIDATE'].map(s => [s,items.filter(i => i.identity_status === s).length])),
      priority_group_counts: Object.fromEntries([1,2,3].map(g => [g,items.filter(i => i.priority_group === g).length])),
      with_image: items.filter(i => i.has_image).length, with_explanation: items.filter(i => i.has_explanation).length,
      multiple_regions: tally('multiple_regions'), possible_cross_page: tally('possible_cross_page'), has_options: tally('has_options'), has_subquestions: tally('has_subquestions'),
      requires_visual_review: items.filter(i => i.requires_visual_review).length, reference_anomaly_questions: items.filter(i => i.reference_anomalies.length).length },
    groups: [1,2,3].map(g => ({ priority: g, title: groupNames[g], question_ids: items.filter(i => i.priority_group === g).map(i => i.paper_question_id) })),
    items, unresolved_issues: ['须对照原文件和题图逐项确认图形、公式、条件、选项、小问及续页，不能用业务 ready 或旧 AI 分类代替。', '字面标记检出不证明完整，未检出不证明没有；多 regions 与跨页仅表示审核重点。', 'R2 键/blob 存在和大小匹配不证明图像正确、原文件 hash 正确或页码未超出真实文件页数。', '本阶段不保存人工审核结果，不进行 2E-2 或 canonical 回填。'] };
}

export function renderPaperReviewMarkdown(report) {
  const block = value => { const text = JSON.stringify(value, null, 2); const fence = '`'.repeat(Math.max(3,...[...text.matchAll(/`+/g)].map(m => m[0].length+1))); return `${fence}json\n${text}\n${fence}`; };
  const esc = value => String(value ?? '').replaceAll('|','\\|').replace(/[\r\n]/g,' ');
  const lines = ['# 阶段 2E-1：Canonical 人工审核报告','', '只读报告，尚未人工审核。多 regions 不等于 INCOMPLETE；原有分类不是审核结论。','', '## 审计及字段规则','', block(report.audit),'',report.field_policy,'',
    'has_options / has_subquestions 只检查原题干字面标记，未检出为 unknown；possible_cross_page 只描述已记录 region 页码。has_image / has_explanation 只表示旧字段非空。','', '## 统计','',block(report.summary),''];
  for (const group of report.groups) {
    const items = report.items.filter(i => i.priority_group === group.priority);
    lines.push(`## 第 ${group.priority} 组：${group.title}（${items.length} 题）`,'', '| 试卷 / 题号 | 旧题 ID | regions / 页码 | 选项 / 小问 | 引用异常 |','|---|---|---|---|---|',
      ...items.map(i => `| ${esc(i.paper_title)} / ${i.question_number} | ${i.paper_question_id} | ${i.region_count} / ${i.distinct_region_pages.join('、') || 'unknown'} | ${i.has_options} / ${i.has_subquestions} | ${esc(i.reference_anomalies.join('；') || '未发现')} |`),'');
    for (const i of items) {
      lines.push(`### ${i.paper_title} / 第 ${i.question_number} 题`,'', `旧题 ID：${i.paper_question_id}；试卷 ID：${i.paper_id}。业务状态：${i.business_status}；2D 身份状态：${i.identity_status}；内容完整性：needs_review。`,'',
        `region_count=${i.region_count}；multiple_regions=${i.multiple_regions}；记录显示跨页=${i.possible_cross_page}；原片段顺序页码=${i.region_pages_in_stored_order?.join(' → ') || 'unknown'}。`,'',
        `has_options=${i.has_options}；has_subquestions=${i.has_subquestions}；requires_visual_review=true；has_image=${i.has_image}；has_explanation=${i.has_explanation}。`,'', '原题干、规范文本和 hash（全文保留）：','',block({ question_text:i.question_text, normalized_text:i.normalized_text, normalized_text_hash:i.normalized_text_hash }),'',
        '原始 regions 和定位：','',block({ regions_raw:i.regions_raw, regions:i.regions, regions_valid:i.regions_valid, cross_page_basis:i.cross_page_basis }),'',
        '题图 / 原文件引用（本地文件可供对照；不调用服务）：','',block({ image:i.image_file_reference, source:i.source_file_reference }),'');
      for (const [label,ref] of [['题图',i.image_file_reference],['原文件',i.source_file_reference]]) for (const object of ref.local_objects) if (object.local_file) lines.push('[查看' + label + '本地文件](<' + object.local_file.replaceAll('\\','/') + '>)','');
      const { analysis_trace, ...classification } = i.classification || {};
      lines.push('现有分类（完整原始分类见 JSON；此处省略旧调用计时信息）：','',block(classification),'', '程序证据与引用异常：','',block({ markers:i.marker_evidence, extracted_visual_markers:i.extracted_visual_marker_evidence, reason:i.priority_reason, anomalies:i.reference_anomalies }),'', '人工核对（未确认）：','',...checklist.map(c => '- [ ] '+c),'',block(i.human_confirmation),'');
    }
  }
  lines.push('## 待人工确认','',...report.unresolved_issues.map(i => '- '+i),'','## 零写入核验','',block(report.zero_write_verification || { pending:true }),'');
  return lines.join('\n');
}
