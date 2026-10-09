import { DECISION_VERSION, COMPLETENESS_FIELDS, APPLICABILITY_FIELDS } from './canonical-identity-decision.mjs';

export const REQUIRED_CROSS_PAGE_IDS = Object.freeze([
  '0d2c5500-aab0-4099-a06d-680d444b2af8', '8012fb6c-ecaa-4c0b-a032-a6b90ed57f0d',
  'e878af8d-b712-4380-a1af-28015c7d712e', '58ad5e46-ebc0-4cbf-a029-f99d6142af78', 'fa35a5f7-9489-47dd-9786-75c9728a4c33',
]);

export function selectReviewRepresentatives(items) {
  const selected = REQUIRED_CROSS_PAGE_IDS.map(id => {
    const item = items.find(i => i.paper_question_id === id);
    if (!item || item.multiple_regions !== true || item.possible_cross_page !== true) throw Error('Required cross-page record missing or changed: ' + id);
    return { ...item, selection_reason:'指定必须覆盖的多 regions / 不同页记录' };
  });
  const singles = items.filter(i => i.region_count === 1 && i.regions_valid).sort((a,b) => a.paper_id.localeCompare(b.paper_id) || a.question_number-b.question_number || a.paper_question_id.localeCompare(b.paper_question_id));
  const take = (predicate, reason, shortest=false) => {
    let pool = singles.filter(i => !selected.some(s => s.paper_question_id === i.paper_question_id) && predicate(i));
    if (shortest) pool = pool.sort((a,b) => a.question_text.length-b.question_text.length || a.paper_question_id.localeCompare(b.paper_question_id));
    if (!pool.length) throw Error('No structural representative for: '+reason);
    selected.push({...pool[0],selection_reason:reason});
  };
  take(i => i.has_options === 'unknown' && i.has_subquestions === 'unknown' && i.priority_group === 3,'最短原题干的单 region 普通样本；长度仅为简单程度代理，不证明无选项',true);
  take(i => i.has_options === true && i.priority_group === 3,'单 region 且现有自动字段检测到选项标记');
  take(i => i.priority_group === 2 && i.visual_dependency_evidence.length > 0,'单 region、有明确图像字面提示的样本；实际图形依赖待人工确认');
  take(i => i.has_subquestions === true && i.priority_group === 3,'单 region 且现有自动字段检测到多个小问标记');
  take(i => i.has_options === 'unknown' && i.has_subquestions === 'unknown' && i.priority_group === 3,'单 region、未检出选项/小问标记的代表；非选择题属性仍未确认');
  return selected;
}

export function createPendingIdentityDecision(item) {
  return {
    decision_version:DECISION_VERSION, decision_origin:'pending_human', paper_question_id:item.paper_question_id, paper_id:item.paper_id, review_status:'NEEDS_REVIEW',
    scope_decision:{status:'unknown',scope_id:null,scope_code:null,scope_type:null,kind:null,ownership_status:null,owner_principal_id:null,decision_basis:'',authorization_evidence:''},
    applicability:Object.fromEntries(APPLICABILITY_FIELDS.map(f => [f,'unknown'])),
    review_context:{multiple_regions:item.multiple_regions,possible_cross_page:item.possible_cross_page},
    ...Object.fromEntries(COMPLETENESS_FIELDS.map(f => [f,'unknown'])), missing_reasons:[],
    review_notes:'待人工审核。程序仅准备材料，未确认适用性、内容完整性或 scope。', reviewed_at:null,
  };
}

export function renderReviewPackageMarkdown(materials) {
  const block = value => { const encoded=JSON.stringify(value,null,2); const fence='`'.repeat(Math.max(3,...[...encoded.matchAll(/`+/g)].map(m=>m[0].length+1))); return `${fence}json\n${encoded}\n${fence}`; };
  const esc = v => String(v??'').replaceAll('|','\\|').replace(/[\r\n]/g,' ');
  const lines=['# 阶段 2E-3：首批 Canonical Identity 人工审核材料包','',
    '10 道待审题。所有 decision 均 NEEDS_REVIEW；八项完整性及适用性均 unknown，reviewed_at=null，无 reviewer。图片和 PDF 为输出目录中的副本，region 预览按原 metadata 裁切，不做 OCR、不删空白、不更改 regions。', '',
    '## 填写说明','', '先对照原文件、当前题图与每个 region 片段。自动检测、classification 和 explanation 都不能替代人工完整性确认。完成实际审核后，将对应 decision_origin 改为 human，填写真实 reviewed_at、适用性、完整性、scope 和最终状态；reviewer 可选。不要把材料生成时间当审核时间。', '',
    '“有图但不跨页”样本由字面提示选取，实际图形依赖仍待你确认；“非选择题”样本仅表示未检出选项标记，不将 unknown 当 false。', '',
    '## 题目索引','', '| 序号 | 试卷 / 题号 | regions / 页码 | 选择依据 |','|---|---|---|---|',
    ...materials.items.map((i,n)=>`| ${n+1} | ${esc(i.paper_title)} / ${i.question_number} | ${i.region_count} / ${i.region_pages_in_stored_order.join('→')} | ${esc(i.selection_reason)} |`),''];
  for(const [n,i] of materials.items.entries()) {
    lines.push(`## ${n+1}. ${i.paper_title} / 第 ${i.question_number} 题`,'',
      block({paper_question_id:i.paper_question_id,paper_id:i.paper_id,paper_title:i.paper_title,question_number:i.question_number,business_status:i.business_status}), '',
      '### 原始题干','',block({question_text:i.question_text}), '', '### 当前题图','',`![当前题图](${i.artifacts.current_image.path})`,'',
      '### 来源与原文件','',`[打开原试卷副本](${i.artifacts.source_file.path})`,'',block({source:i.source_file_reference,copy:i.artifacts.source_file}),'',
      '### regions 与逐片段预览','', '完整原数组保留在下方；预览按 page + 原 region 序号排序，原数组索引始终显示。空白片段也保留，不能据此确认缺失。','',
      block({region_count:i.region_count,regions_raw:i.regions_raw,regions:i.regions,original_page_sequence:i.region_pages_in_stored_order}),'');
    for(const region of i.artifacts.region_previews) {
      lines.push(`#### 第 ${region.page} 页 / 原 region ${region.original_region_index+1}`,'',block({metadata:region.metadata,pixel_box:region.pixel_box}), '',
        region.path ? `![region ${region.original_region_index+1} / 第 ${region.page} 页](${region.path})` : '预览生成失败：'+region.error,'');
      if(region.page_preview) lines.push(`[查看第 ${region.page} 页完整页面](${region.page_preview})`,'');
    }
    lines.push('### 2E-1 自动检测信息','',block({multiple_regions:i.multiple_regions,possible_cross_page:i.possible_cross_page,requires_visual_review:i.requires_visual_review,has_options:i.has_options,has_subquestions:i.has_subquestions,marker_evidence:i.marker_evidence,reference_anomalies:i.reference_anomalies}), '',
      '### 现有 classification','',block(i.classification),'',
      '### explanation（只作辅助，不能证明身份完整）','',block({explanation:i.explanation,explanation_raw:i.explanation_raw}),'',
      '### 人工审核清单','',...['题干完整','公式/符号/条件完整','选项完整 / 不适用','小问完整 / 不适用','图形完整 / 不适用','所有属于本题的 regions 完整且顺序确认','跨页完整 / 不适用','source 确认','scope 确认'].map(s=>'- [ ] '+s),'',
      '最终人工决定（尚未填写）：','', '- [ ] READY','- [ ] NEEDS_REVIEW','- [ ] INCOMPLETE','', '当前待填写 decision：','',block(i.pending_decision),'');
  }
  lines.push('## 结构检查与边界','',block(materials.summary),'', '短 region、高空白比例、多个页码只是展示线索，不能自动决定 READY / INCOMPLETE。原代码拼接题图会跳过纯空白片段；本包的 region 预览不跳过任何已记录片段。', '',
    '## 验证','',block(materials.verification),'', '本阶段到此停止，不执行 canonical 回填或 2E-4。','');
  return lines.join('\n');
}
