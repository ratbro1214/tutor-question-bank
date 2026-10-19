import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/knowledge_graph/senior-math-v1.json';
import { knowledgeLesson, lessonSeeds } from '../lib/knowledge_graph/learning-content';

test('every catalog node has explanatory text and at least one complete, relevant solved example', () => {
  assert.equal(catalog.nodes.length, 392);
  for (const node of catalog.nodes) {
    const lesson = knowledgeLesson(node.code);
    assert.ok(lesson, `Missing lesson: ${node.code}`);
    assert.equal(lesson.title, node.name);
    assert.equal(lesson.reviewStatus, 'draft');
    assert.ok(lesson.explanation.length >= 2, node.code);
    assert.ok(lesson.explanation.every(p => p.trim().length >= 10), node.code);
    assert.ok(lesson.examples.length > 0, node.code);
    for (const example of lesson.examples) {
      assert.ok(example.question.length >= 10 && example.answer.trim().length > 0, node.code);
      assert.ok(example.steps.length >= 2 && example.steps.every(s => s.length > 5), node.code);
      assert.ok(catalog.nodes.some(n => n.level === 4 && n.name === example.focus), node.code);
    }
  }
});

test('all 152 exam points have authored material, with no unknown or orphan content', () => {
  const examPoints = catalog.nodes.filter(n => n.level === 4);
  assert.equal(examPoints.length, 152);
  assert.deepEqual(Object.keys(lessonSeeds).sort(), examPoints.map(n => n.code).sort());
  for (const node of examPoints) assert.equal(knowledgeLesson(node.code)!.examples[0].focus, node.name);
});

test('task-type examples follow the actual hierarchy and never fall back to another chapter', () => {
  for (const task of catalog.nodes.filter(n => n.level === 5)) {
    const edge = catalog.edges.find(e => e.relation_type === 'belongs_to' && e.source_id === task.id || e.relation_type === 'contains' && e.target_id === task.id)!;
    const parentId = edge.relation_type === 'belongs_to' ? edge.target_id : edge.source_id;
    const parent = catalog.nodes.find(n => n.id === parentId)!;
    assert.deepEqual(knowledgeLesson(task.code)!.examples, knowledgeLesson(parent.code)!.examples);
    assert.ok(knowledgeLesson(task.code)!.explanation.includes(task.description));
  }
});

test('complex-parameter classification example checks both real and nonzero imaginary conditions', () => {
  const lesson = knowledgeLesson('COMPLEX.CONCEPT.E2.T1')!;
  assert.match(lesson.examples[0].answer, /m=−1/);
  assert.match(lesson.examples[0].answer, /m=1/);
  assert.ok(lesson.examples[0].steps.some(s => s.includes('≠0')));
  assert.ok(lesson.explanation.some(p => p.includes('零是实数，但不是纯虚数')));
});

test('unrecognized custom nodes get no invented or unrelated teaching note', () => {
  assert.equal(knowledgeLesson('CUSTOM.UNKNOWN'), null);
});
