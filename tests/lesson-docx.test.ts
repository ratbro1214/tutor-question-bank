import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { createLessonDocx } from '../lib/lesson-docx';
import { texToWordMath } from '../lib/docx-math';
import { lessonContentSchema } from '../lib/lesson-plan';
import { exportFilename, type LessonExportSnapshot } from '../lib/lesson-export';
import { loadLessonExportImages } from '../lib/lesson-export-client';
import { moveLessonStage } from '../lib/lesson-stage-edit';
import type { LessonStructure } from '../lib/lesson-structure';
const c = randomUUID(), r = randomUUID(), c2 = randomUUID(), r2 = randomUUID();
function snapshot(): LessonExportSnapshot {
  const content = lessonContentSchema.parse({ topic: 'TEST ONLY 二次函数', questions: [{ canonicalId: c, revisionId: r, notes: '教师保密NOTES' }, { canonicalId: c2, revisionId: r2, purpose: '练习' }], studentSummary: '学生知识提要 核对定义域。', goals: '教师保密GOALS', flow: '教师保密FLOW', summary: '教师保密SUMMARY' });
  return { planId: randomUUID(), versionId: randomUUID(), revision: 3, status: 'draft', content, questions: [
    { canonicalId: c, revisionId: r, text: '测试题干：求 \\(f(x)=x^{2}+\\frac{1}{2}\\) 的值。\n不得丢失的末尾条件', stage: '高中', identityStatus: 'ready', knowledge: [{ code: 'TEST', name: '二次函数' }], difficulty: '基础', questionType: '直接计算', sources: [{ title: 'TEST SOURCE', page: 1, questionNumber: '2' }], images: [{ id: 'img1', url: `/api/math-library/${c}/image/img1` }], answerStatus: 'reviewed', reviewedExplanation: { status: 'ready', answer: '教师保密ANSWER', approach: '教师保密APPROACH', steps: [{ title: '核对', content: '教师保密STEPS' }], teachingNotes: '教师保密HINT', commonMistakes: '教师保密MISTAKE', verification: '教师核对', alternativeMethod: '', missingInformation: '' } },
    { canonicalId: c2, revisionId: r2, text: '练习题末尾条件保留', stage: '高中', identityStatus: 'ready', knowledge: [], difficulty: '中等', questionType: '证明题', sources: [], images: [], answerStatus: 'missing', reviewedExplanation: null },
  ] };
}
const images = [{ id: 'img1', type: 'png' as const, width: 400, height: 200, data: new Uint8Array([1, 2, 3]) }];
test('two Word documents use one snapshot, preserve complete problems and image bytes, and have identical provenance', () => {
  const data = snapshot(), teacher = unzipSync(createLessonDocx(data, 'teacher', images)), student = unzipSync(createLessonDocx(data, 'student', images));
  for (const files of [teacher, student]) {
    const body = strFromU8(files['word/document.xml']);
    assert.match(body, /不得丢失的末尾条件/); assert.match(body, /第 1 题/); assert.match(body, /第 2 题/);
    assert.match(body, /<m:f>/); assert.match(body, /<m:sSup>/); assert.match(body, /<w:drawing>/);
    assert.deepEqual(files['word/media/image1.png'], images[0].data); assert.match(strFromU8(files['[Content_Types].xml']), /document.main\+xml/);
    assert.ok(files['word/styles.xml']); assert.ok(files['word/footer.xml']);
  }
  assert.equal(strFromU8(teacher['docProps/custom.xml']), strFromU8(student['docProps/custom.xml']));
});
test('student archive contains no teacher-only prose, notes, answers, explanations or backup contents', () => {
  const data = snapshot(); data.content.aiBackups = [{ createdAt: new Date().toISOString(), action: 'TEST', original: '教师保密BACKUP' }];
  const student = unzipSync(createLessonDocx(data, 'student', images));
  for (const [name, bytes] of Object.entries(student)) if (name.endsWith('.xml')) assert.doesNotMatch(strFromU8(bytes), /教师保密/);
  const body = strFromU8(student['word/document.xml']); assert.match(body, /学生知识提要/); assert.match(body, /作答空间/);
  const teacher = strFromU8(unzipSync(createLessonDocx(data, 'teacher', images))['word/document.xml']);
  assert.match(teacher, /教师保密ANSWER/); assert.match(teacher, /教师保密NOTES/); assert.match(teacher, /缺少本内容版本/);
});
test('long problems flow through paragraphs without a fixed-height box or truncation', () => {
  const data = snapshot(); data.questions[0].text = '完整题干。'.repeat(2000) + '\n最终条件必须存在';
  const body = strFromU8(unzipSync(createLessonDocx(data, 'teacher', images))['word/document.xml']);
  assert.equal((body.match(/完整题干。/g) || []).length, 2000); assert.match(body, /最终条件必须存在/); assert.doesNotMatch(body, /<w:trHeight|<w:txbxContent/);
});
test('export refuses missing images, mismatched versions and damaged formulas instead of issuing partial files', () => {
  const data = snapshot(); assert.throws(() => createLessonDocx(data, 'student', []), /原图未能读取/);
  data.questions[0].revisionId = randomUUID(); assert.throws(() => createLessonDocx(data, 'teacher', images), /引用不一致/);
  assert.throws(() => texToWordMath('\\notARealCommand{x}', false), /无法导出/);
});
test('native Word math supports fractions, powers, roots, subscripts, matrices and aligned equations', () => {
  for (const tex of ['\\frac{x^{2}}{2}', '\\sqrt{x}+\\sqrt[3]{y}', 'x_{1}+a_{n}^{2}', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}', '\\sum_{k=1}^{n}k', '\\overline{AB}', '\\alpha \\le \\beta']) assert.match(texToWordMath(tex, true), /<m:oMath>/);
});
test('multiline display equations remain a single native equation block with all rows', () => {
  const data = snapshot(); data.questions[0].text = '完整题干\n\\[\n\\begin{aligned}x&=1\\\\y&=2\\end{aligned}\n\\]\n末尾条件';
  const body = strFromU8(unzipSync(createLessonDocx(data, 'student', images))['word/document.xml']);
  assert.match(body, /<m:oMathPara>/); assert.equal((body.match(/<m:mr>/g) || []).length, 2); assert.match(body, /末尾条件/);
});
test('image loading uses authorized original routes, supports conversion and stops on cancellation or missing assets', async () => {
  const data = snapshot(), controller = new AbortController();
  const loaded = await loadLessonExportImages(data, controller.signal, async blob => ({ data: new Uint8Array(await blob.arrayBuffer()), width: 2, height: 1, type: 'png' }), async url => { assert.equal(url, data.questions[0].images[0].url); return new Response(new Uint8Array([1, 2, 3])); });
  assert.deepEqual(loaded[0].data, images[0].data);
  await assert.rejects(loadLessonExportImages(data, controller.signal, undefined, async () => new Response('', { status: 404 })), /导出已停止/);
  data.questions[0].images[0].url = 'https://invalid.example/private'; await assert.rejects(loadLessonExportImages(data, controller.signal), /不属于/);
  controller.abort(); await assert.rejects(loadLessonExportImages(snapshot(), controller.signal));
});
test('teacher may reorder saved stages without losing content or duration; AI still enforces its default flow', () => {
  const structure: LessonStructure = { objectives: ['测试'], prerequisites: ['测试'], focus: ['测试'], difficulties: ['测试'], classroomQuestions: ['测试'], commonMistakes: ['测试'], practiceSuggestions: ['测试'], summary: '测试', examples: [], stages: [
    { kind: '导入', title: '导入', minutes: 5, purpose: '测试', activities: '测试', questionIds: [], explanation: '测试', followUps: ['测试'] },
    { kind: '总结', title: '总结', minutes: 40, purpose: '测试', activities: '测试', questionIds: [], explanation: '测试', followUps: ['测试'] },
  ] };
  const stages = moveLessonStage(structure.stages, 1, -1); assert.equal(stages[0].title, '总结'); assert.equal(structure.stages[0].title, '导入');
  assert.ok(lessonContentSchema.parse({ topic: 'TEST ONLY', structure: { ...structure, stages } }));
  assert.match(exportFilename(snapshot(), 'student'), /学生版讲义-v3.docx$/);
});
