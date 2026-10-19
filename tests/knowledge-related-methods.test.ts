import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GraphMethod } from '../lib/knowledge-graph';
import { openMathCatalog } from '../lib/open-math';
import { relatedMethods } from '../lib/knowledge_graph/related-methods';
import { hierarchy, type StarSnapshot } from '../lib/knowledge_graph/star-map';
import { coreStrategies } from '../lib/method-strategies';

const catalog = JSON.parse(readFileSync(new URL('../data/knowledge_graph/senior-math-v1.json', import.meta.url), 'utf8'));
const snapshot: StarSnapshot = { nodes: catalog.nodes.map((n: object) => ({ ...n, question_count: 0 })), edges: catalog.edges };
const node = snapshot.nodes.find(n => n.code === 'COMPLEX.CONCEPT.E1.T1')!;
const tree = hierarchy(snapshot), parent = tree.byId.get(tree.parent.get(node.id)!)!;
function method(code: string, overrides: Partial<GraphMethod> = {}): GraphMethod {
  return { id: code, scope_id: 'visible-scope', revision: 1, status: 'candidate', evidenceValid: true, merged_into: null, updated_at: '', source: { origin: 'manual', note: 'fixture', evidence: null }, content: { ...coreStrategies.cards[0], strategy: { ...coreStrategies.cards[0].strategy, catalogCodes: [code] } }, ...overrides };
}

test('current-node mappings are direct; ancestor mappings are explicitly broader references', () => {
  const matches = relatedMethods(node, snapshot, [method(node.code), method(parent.code)], { ...openMathCatalog, methods: [] });
  assert.equal(matches.length, 2);
  assert.equal(matches[0].direct, true);
  assert.equal(matches[0].match, '当前知识匹配');
  assert.equal(matches[1].direct, false);
  assert.equal(matches[1].match, '上级知识参考');
});

test('complex-number task never inherits unrelated inequality cards or a chapter reference as an exact match', () => {
  const unrelated = method('INEQUALITY.BASIC');
  const matches = relatedMethods(node, snapshot, [unrelated], openMathCatalog);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(m => m.origin === 'public' && !m.direct));
  assert.ok(matches.every(m => m.match === '同章参考 · 非当前题型匹配'));
});

test('formal view excludes candidates, invalid evidence, merged cards, rejected cards and public references', () => {
  const matches = relatedMethods(node, snapshot, [
    method(node.code), method(node.code, { id: 'approved', status: 'approved' }),
    method(node.code, { id: 'invalid', status: 'approved', evidenceValid: false }),
    method(node.code, { id: 'merged', status: 'approved', merged_into: 'other' }),
    method(node.code, { id: 'rejected', status: 'rejected' }),
  ], openMathCatalog, true);
  assert.deepEqual(matches.map(m => m.id), ['teacher:approved']);
});

test('a parent knowledge node includes explicitly mapped descendant methods', () => {
  const matches = relatedMethods(parent, snapshot, [method(node.code)], { ...openMathCatalog, methods: [] });
  assert.equal(matches[0].match, '下级知识匹配');
  assert.equal(matches[0].direct, true);
});
