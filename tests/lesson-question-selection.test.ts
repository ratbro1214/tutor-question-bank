import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSelectionWeights, rankLessonCandidates, selectLessonQuestion, moveLessonQuestion, type LibraryCandidate } from '../lib/lesson-question-selection';
import type { Classification } from '../lib/classification';
import { parseLibraryFilters, libraryWhere } from '../lib/math-library-query';
import { libraryExplanation } from '../lib/math-library-explanation';
import { emptyExplanation } from '../lib/question-explanation';

const item = (id: string, classification: Partial<Classification> = {}): LibraryCandidate => ({ id, text: 'TEST ONLY 这是超过二十个字符的测试题干不是真实题目或交付数据', stage: '高中', identity_status: 'ready', imageUrl: null, classification: classification as Classification, sources: [] });
test('rule ranking explains target matches, penalizes repeated identities and permits weight changes', () => {
  const a = item('a', { knowledge_points: [{ code: 'K', name: '测试' }], difficulty: '中等', question_type: '证明题' }), b = { ...item('b'), text: 'TEST ONLY 另一个题干' };
  const target = { knowledge: 'K', difficulty: '中等', type: '证明题' };
  const ranked = rankLessonCandidates([b, a], target, [], defaultSelectionWeights);
  assert.equal(ranked[0].item.id, 'a'); assert.equal(ranked[0].score, 9); assert.ok(ranked[0].reasons.includes('匹配目标知识点'));
  const repeated = rankLessonCandidates([a, b], target, [{ canonicalId: 'a', text: a.text }], { ...defaultSelectionWeights, repetition: 100 });
  assert.equal(repeated[0].item.id, 'b'); assert.ok(repeated[1].reasons.some(s => s.includes('降低排序')));
  assert.deepEqual(rankLessonCandidates([], target, [], defaultSelectionWeights), []);
  assert.throws(() => rankLessonCandidates([a], target, [], { ...defaultSelectionWeights, quality: NaN }));
});
test('manual replacement preserves position, purpose and notes; reorder never changes versions', () => {
  const old = [{ canonicalId: 'a', revisionId: 'a1', purpose: '导入' as const, notes: '教师备注' }, { canonicalId: 'b', revisionId: 'b1', purpose: '检测' as const, notes: '' }];
  const next = selectLessonQuestion(old, { canonicalId: 'c', revisionId: 'c1', purpose: '讲解', notes: '' }, 'a');
  assert.equal(next[0].purpose, '导入'); assert.equal(next[0].notes, '教师备注'); assert.equal(next[0].revisionId, 'c1');
  assert.deepEqual(moveLessonQuestion(next, 0, 1), [next[1], next[0]]); assert.equal(old[0].canonicalId, 'a');
  assert.throws(() => selectLessonQuestion(old, old[1], 'a'), /重复/);
  assert.throws(() => selectLessonQuestion(old, next[0], 'missing'), /已移除/);
});
test('shared query validates review filters and emits bound identity or classification conditions', () => {
  const f = parseLibraryFilters(new URLSearchParams('review=needs_review&stage=高中'));
  assert.ok(libraryWhere(f).sql.includes('c.identity_status=?')); assert.ok(libraryWhere(f).values.includes('needs_review'));
  assert.ok(libraryWhere(parseLibraryFilters(new URLSearchParams('review=classification_review'))).sql.includes('needs_review'));
  assert.throws(() => parseLibraryFilters(new URLSearchParams('review=fake')));
});
test('explanation review comes from stored data only; stale and malformed explanations are withheld', () => {
  const content = { ...emptyExplanation, answer: 'TEST ONLY', approach: '测试', steps: [{ title: '测试', content: '测试' }] };
  assert.equal(libraryExplanation(JSON.stringify(content), 1, '原文', true).explanationReviewed, true);
  assert.equal(libraryExplanation(content, null, '原文', true).explanationReviewed, null);
  assert.equal(libraryExplanation({ content, reviewed: false, sourceText: '原文' }, null, '原文', true).explanationReviewed, false);
  assert.equal(libraryExplanation({ content, reviewed: true, sourceText: '旧文' }, null, '原文', true).explanation, null);
  assert.equal(libraryExplanation(content, 1, '原文', false).explanation, null);
  assert.equal(libraryExplanation('{broken', 1, '原文', true).explanation, null);
  assert.equal(libraryExplanation({ steps: 'broken' }, 1, '原文', true).explanation, null);
});
