import { strToU8, zipSync } from 'fflate';
import { docxXml as xml, texToWordMath } from './docx-math';
import { splitMathText } from './math-text';
import { lessonContentSchema } from './lesson-plan';
import type { ExportImage, LessonExportSnapshot } from './lesson-export';

const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const math = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
function textRun(text: string) { return `<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`; }
function paragraph(text: string, style = 'Normal') {
    let result = '', inline = '';
    const wrap = (runs: string, display = false) => `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:widowControl/></w:pPr>${display ? `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${runs}</m:oMathPara>` : runs}</w:p>`;
    for (const part of splitMathText(text)) {
      if (part.kind === 'math') {
        const formula = texToWordMath(part.tex!, Boolean(part.display));
        if (part.display) { if (inline) result += wrap(inline); inline = ''; result += wrap(formula, true); }
        else inline += formula;
      } else {
        const lines = (part.displayText ?? part.source).split(/\r?\n/);
        lines.forEach((line, index) => { if (index) { if (inline) result += wrap(inline); inline = ''; } inline += textRun(line); });
      }
    }
    if (inline || !result) result += wrap(inline || textRun(''));
    return result;
}
const heading = (text: string, level = 1) => paragraph(text, `Heading${level}`);
const section = (title: string, text: string) => heading(title) + paragraph(text.trim() || '未填写');

function imageDrawing(image: ExportImage, index: number) {
  if (!(image.width > 0 && image.height > 0) || !Number.isFinite(image.width + image.height)) throw Error('原图尺寸无效。');
  const scale = Math.min(1, 5800000 / (image.width * 9525), 5000000 / (image.height * 9525));
  const cx = Math.round(image.width * 9525 * scale), cy = Math.round(image.height * 9525 * scale);
  return `<w:p><w:pPr><w:spacing w:before="100" w:after="140"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index}" name="原始题图 ${index}" descr="题库原始题图"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="原始题图 ${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${index}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
export function createLessonDocx(snapshot: LessonExportSnapshot, audience: 'teacher' | 'student', images: ExportImage[]) {
  const content = lessonContentSchema.parse(snapshot.content), s = content.structure;
  if (new Set(snapshot.questions.map(q => q.canonicalId)).size !== content.questions.length || content.questions.some(q => !snapshot.questions.some(record => record.canonicalId === q.canonicalId && record.revisionId === q.revisionId))) throw Error('导出题目与已保存引用不一致。');
  const byImage = new Map(images.map(i => [i.id, i])), used = new Map<string, number>();
  const files: Record<string, Uint8Array> = {}, imageRelationships: string[] = [];
  const put = (path: string, value: string) => { files[path] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + value); };
  let body = paragraph(content.topic.replace(/[：:，,。.!！?？]/g, ' '), 'Title');
  body += paragraph(audience === 'teacher' ? '教师版教案' : '学生版讲义', 'Subtitle');
  body += paragraph(`${content.stage} ${content.grade}  课程时长 ${content.duration} 分钟  ${content.scenario}`);
  body += paragraph(`教案保存版本 ${snapshot.revision}`, 'Caption');
  if (audience === 'teacher') {
    body += paragraph('本教案用于课堂组织与备课。例题沿用题库原题及固定内容版本，讲解建议由教师核对后使用。');
    body += section('教学目标', s?.objectives.join('\n') || content.goals);
    body += section('前置知识', s?.prerequisites.join('\n') || content.baseline);
    body += section('教学重点', s?.focus.join('\n') || content.analysis);
    body += section('教学难点', s?.difficulties.join('\n') || '未单独填写');
    body += heading('教学流程');
    if (s) s.stages.forEach((stage, i) => {
      body += heading(`${i + 1} ${stage.title} ${stage.minutes} 分钟`, 2);
      body += paragraph(`教学目的：${stage.purpose}`) + paragraph(`教学活动：${stage.activities}`) + paragraph(`讲解建议：${stage.explanation}`) + paragraph('课堂追问：\n' + stage.followUps.join('\n'));
      body += paragraph('引用题目：' + (stage.questionIds.map(id => `第 ${content.questions.findIndex(q => q.canonicalId === id) + 1} 题`).join('、') || '无'));
    }); else body += paragraph(content.flow || '未填写');
  } else {
    body += paragraph('请阅读知识提要，在题目下方保留完整作答过程，课堂讲解时补充方法与易错点。');
    const knowledge = [...new Set(snapshot.questions.flatMap(q => q.knowledge.map(k => k.name)))];
    body += section('知识提要', content.studentSummary || (knowledge.length ? knowledge.join('；') : `学习专题：${content.topic}`));
  }
  body += heading(audience === 'teacher' ? '真实例题与课堂练习' : '例题与练习');
  if (!content.questions.length) body += paragraph('尚未选择题库题目。');
  content.questions.forEach((selected, position) => {
    const q = snapshot.questions.find(record => record.canonicalId === selected.canonicalId && record.revisionId === selected.revisionId)!;
    const example = s?.examples.find(e => e.canonicalId === q.canonicalId && e.revisionId === q.revisionId);
    body += heading(`第 ${position + 1} 题 ${['练习', '检测'].includes(selected.purpose) ? '练习' : '例题'}`, 2);
    if (q.text) body += paragraph(q.text);
    for (const reference of q.images) {
      const image = byImage.get(reference.id); if (!image) throw Error(`第 ${position + 1} 题原图未能读取，导出已停止。`);
      let index = used.get(reference.id);
      if (!index) {
        index = used.size + 1; used.set(reference.id, index);
        files[`word/media/image${index}.${image.type}`] = image.data;
        imageRelationships.push(`<Relationship Id="image${index}" Type="${rel}/image" Target="media/image${index}.${image.type}"/>`);
      }
      body += imageDrawing(image, index);
    }
    body += paragraph('来源：' + (q.sources.map(source => source.title + (source.questionNumber ? ` 第 ${source.questionNumber} 题` : '') + (source.page ? ` 第 ${source.page} 页` : '')).join('；') || '来源未记录'), 'Caption');
    if (audience === 'teacher') {
      body += paragraph(`用途：${selected.purpose}  题型：${q.questionType || '未标注'}  难度：${q.difficulty || '未标注'}`);
      body += paragraph(`Canonical：${q.canonicalId}\n内容版本：${q.revisionId}`, 'Caption');
      if (example) body += paragraph('例题安排：' + example.arrangement) + paragraph('关键讲解思路：' + example.keyIdeas) + paragraph('课堂追问：\n' + example.followUps.join('\n')) + paragraph('常见易错点：\n' + example.mistakes.join('\n'));
      if (selected.notes) body += paragraph('教师讲解备注：' + selected.notes);
      if (q.answerStatus === 'reviewed' && q.reviewedExplanation) {
        const answer = q.reviewedExplanation;
        body += paragraph('参考答案 经教师审核的题库解析', 'Heading3') + paragraph(answer.answer) + paragraph('解题思路：' + answer.approach);
        answer.steps.forEach((step, i) => { body += paragraph(`${i + 1} ${step.title}`) + paragraph(step.content); });
        for (const [label, text] of [['教学提示', answer.teachingNotes], ['易错点', answer.commonMistakes], ['验证说明', answer.verification], ['其他方法', answer.alternativeMethod]]) if (text) body += paragraph(label + '：' + text);
      } else body += paragraph(q.answerStatus === 'unverified' ? '参考答案：已有解析未经教师审核，本次不作为已核验答案导出。' : '参考答案：缺少本内容版本的可用审核解析，请教师核对后补充。');
    } else {
      body += paragraph('作答空间');
      for (let line = 0; line < content.answerLines; line++) body += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="2" w:color="D9D9D9"/></w:pBdr><w:spacing w:after="0" w:line="420" w:lineRule="atLeast"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
    }
  });
  if (audience === 'teacher') {
    body += section('课堂追问', s?.classroomQuestions.join('\n') || '未单独填写');
    body += section('易错点与教学提示', s?.commonMistakes.join('\n') || content.analysis);
    body += section('巩固练习安排', s?.practiceSuggestions.join('\n') || content.exercises);
    body += section('课堂总结', s?.summary || content.summary);
    // Teacher's retained prose must not disappear when structured text exists.
    if (s && [content.goals, content.baseline, content.analysis, content.flow, content.examples, content.exercises, content.summary].some(t => t.trim())) {
      body += heading('教师补充内容');
      for (const [label, value] of [['教学目标', content.goals], ['基础描述', content.baseline], ['知识分析', content.analysis], ['教学流程', content.flow], ['例题讲解', content.examples], ['练习安排', content.exercises], ['总结', content.summary]]) if (value.trim()) body += heading(label, 2) + paragraph(value);
    } else if (!s && content.examples) body += section('教师例题讲解补充', content.examples);
  }
  const ns = `xmlns:w="${word}" xmlns:r="${rel}" xmlns:m="${math}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
  put('word/document.xml', `<w:document ${ns}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/><w:cols w:space="720"/></w:sectPr></w:body></w:document>`);
  put('word/styles.xml', `<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    ${[['Title', '36'], ['Subtitle', '26'], ['Heading1', '28'], ['Heading2', '24'], ['Heading3', '22'], ['Caption', '18']].map(([id, size]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:pPr>${id === 'Caption' ? '' : '<w:keepNext/>'}<w:spacing w:before="${id.startsWith('Heading') ? 220 : 0}" w:after="140"/></w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="${size}"/>${id.startsWith('Heading') || id === 'Title' ? '<w:b/>' : ''}</w:rPr></w:style>`).join('')}</w:styles>`);
  put('word/settings.xml', `<w:settings xmlns:w="${word}" xmlns:m="${math}"><w:compat/><m:mathPr><m:mathFont m:val="Cambria Math"/><m:wrapIndent m:val="0"/></m:mathPr></w:settings>`);
  put('word/footer.xml', `<w:ftr xmlns:w="${word}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${textRun('第 ')}<w:fldSimple w:instr="PAGE">${textRun('1')}</w:fldSimple>${textRun(' 页')}</w:p></w:ftr>`);
  put('word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="settings" Type="${rel}/settings" Target="settings.xml"/><Relationship Id="footer" Type="${rel}/footer" Target="footer.xml"/>${imageRelationships.join('')}</Relationships>`);
  put('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="${rel}/officeDocument" Target="word/document.xml"/><Relationship Id="custom" Type="${rel}/custom-properties" Target="docProps/custom.xml"/></Relationships>`);
  const provenance = { planId: snapshot.planId, versionId: snapshot.versionId, revision: snapshot.revision, questions: content.questions.map(q => ({ canonicalId: q.canonicalId, revisionId: q.revisionId })) };
  put('docProps/custom.xml', `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="CanonicalLessonProvenance"><vt:lpwstr>${xml(JSON.stringify(provenance))}</vt:lpwstr></property></Properties>`);
  put('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${[['/word/document.xml', 'document.main'], ['/word/styles.xml', 'styles'], ['/word/settings.xml', 'settings'], ['/word/footer.xml', 'footer']].map(([path, type]) => `<Override PartName="${path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('')}<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`);
  return zipSync(files, { level: 6 });
}
