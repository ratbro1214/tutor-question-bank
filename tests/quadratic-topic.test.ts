import test from 'node:test';
import assert from 'node:assert/strict';
import { quadraticCases, topicReference, quadraticEvaluationPack, newTopicSession, appendTopicEvent, parseTopicSession, topicAdvice, type TopicEvent, type TopicSession } from '../lib/quadratic-topic';

const event = (stage: TopicEvent['stage'], caseId: string, targetId: string | null, extra: Partial<TopicEvent> = {}): TopicEvent => ({
  id: stage, stage, caseId, targetId, response: '教师记录的实际过程', correctness: 'incorrect', support: 'independent', at: '2026-10-27T01:00:00.000Z', ...extra,
});
function throughTransfer(mode: TopicSession['mode'] = 'rehearsal', support: TopicEvent['support'] = 'independent') {
  let s = newTopicSession('E1', mode);
  s = appendTopicEvent(s, event('initial', 'E1', null));
  s = appendTopicEvent(s, event('diagnostic', 'E2', 'initial'));
  s = appendTopicEvent(s, event('teaching', 'E1', 'initial', { support: 'explained', correctness: 'uncertain' }));
  return appendTopicEvent(s, event('transfer', 'E3', 'initial', { correctness: 'correct', support }));
}
test('16道边界题与手工计算的参数范围一致，包含方向及开闭', () => {
  const expected = [
    ['E1', 'upper', 0, true], ['E2', 'upper', 0, false], ['E3', 'upper', 2, true], ['E4', 'upper', -1, false],
    ['Q1', 'upper', 0, true], ['Q2', 'upper', 4, true], ['Q3', 'upper', 9, false], ['Q4', 'lower', 1, false],
    ['V1', 'upper', 0, true], ['V2', 'upper', 1, true], ['V3', 'lower', 4, true], ['V4', 'upper', 1, true],
    ['D1', 'lower', 5, true], ['D2', 'upper', 3, false], ['D3', 'upper', -2, true], ['D4', 'lower', -1, true],
  ];
  assert.equal(quadraticCases.length, expected.length);
  for (const [id, direction, boundary, included] of expected) {
    const row = quadraticCases.find(c => c.id === id)!;
    const result = topicReference(row);
    assert.equal(result.status, 'verified', String(id));
    assert.deepEqual(result.parameter, { direction, boundary, included }, String(id));
  }
});
test('题包只包含开发集，并把同一观察重点保留在同一组', () => {
  const pack = quadraticEvaluationPack();
  assert.equal(pack.cases.length, 16);
  assert.ok(pack.cases.every(c => c.split === 'development'));
  assert.equal(new Set(pack.cases.map(c => c.group)).size, 4);
});
test('不能跳过诊断、关联其他原题或把重做算作新题', () => {
  const s = appendTopicEvent(newTopicSession('E1', 'rehearsal'), event('initial', 'E1', null));
  assert.throws(() => appendTopicEvent(s, event('transfer', 'E3', 'initial')), /顺序/);
  assert.throws(() => appendTopicEvent(s, event('diagnostic', 'E2', 'other')), /明确关联/);
  assert.throws(() => appendTopicEvent(s, event('diagnostic', 'E1', 'initial')), /新题/);
  assert.throws(() => appendTopicEvent(s, event('diagnostic', 'Q1', 'initial')), /同一观察重点/);
});
test('不能通过已讲解、提示正确或原题重做宣称获得独立正确证据', () => {
  const prompted = throughTransfer('rehearsal', 'prompted');
  assert.match(topicAdvice(prompted).title, /尚无独立正确/);
  const independent = throughTransfer();
  assert.match(topicAdvice(independent).title, /等待间隔复查/);
  assert.throws(() => appendTopicEvent(independent, event('review', 'E3', 'initial')), /新题/);
  const reviewed = appendTopicEvent(independent, event('review', 'E4', 'initial', { correctness: 'correct' }));
  assert.match(topicAdvice(reviewed).title, /两次新题独立正确/);
  assert.match(topicAdvice(reviewed).detail, /不据此认定长期掌握/);
  assert.deepEqual(topicAdvice(reviewed).evidenceIds, ['initial', 'diagnostic', 'transfer', 'review']);
});
test('真实课堂复查须间隔24小时，演练与观察用途分别保留', () => {
  const observed = throughTransfer('observed');
  assert.throws(() => appendTopicEvent(observed, event('review', 'E4', 'initial')), /24小时/);
  assert.throws(() => appendTopicEvent(observed, event('review', 'E4', 'initial', { at: '2026-10-28T00:59:59.999Z' })), /24小时/);
  const s = appendTopicEvent(observed, event('review', 'E4', 'initial', { at: '2026-10-28T01:00:00.000Z' }));
  assert.equal(parseTopicSession(JSON.parse(JSON.stringify(s))).mode, 'observed');
  assert.equal(throughTransfer().mode, 'rehearsal');
});
test('恢复记录重新检查时间、未知题目、重复编号与错序，不能仅信任导入状态', () => {
  const s = throughTransfer();
  assert.deepEqual(parseTopicSession(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => parseTopicSession({ ...s, anchorId: 'unknown' }), /不存在/);
  assert.throws(() => parseTopicSession({ ...s, events: [...s.events].reverse() }), /顺序/);
  assert.throws(() => parseTopicSession({ ...s, events: [s.events[0], { ...s.events[1], id: 'initial' }] }), /编号重复/);
  assert.throws(() => parseTopicSession({ ...s, events: [s.events[0], { ...s.events[1], at: '2026-10-26T01:00:00Z' }] }), /时间不能/);
});
