import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hierarchy, visibleGraph, starPositions, nodeColor, nodeSize, type StarSnapshot } from '../lib/knowledge_graph/star-map';

const catalog = JSON.parse(readFileSync(new URL('../data/knowledge_graph/senior-math-v1.json', import.meta.url), 'utf8'));
const snapshot: StarSnapshot = { nodes: catalog.nodes.map((n: object) => ({ ...n, question_count: 0 })), edges: catalog.edges };
const root = snapshot.nodes.find(n => n.level === 1)!;
const tree = hierarchy(snapshot);

test('overview reveals eleven chapters without leaking collapsed descendants', () => {
  const graph = visibleGraph(snapshot, new Set([root.id]));
  assert.equal(graph.nodes.length, 12);
  assert.ok(graph.nodes.every(n => n.level <= 2));
  assert.ok(graph.edges.every(e => graph.nodes.some(n => n.id === e.source_id) && graph.nodes.some(n => n.id === e.target_id)));
});

test('search path reveals every task type in its own chapter', () => {
  for (const task of snapshot.nodes.filter(n => n.level === 5)) {
    const path = tree.path(task.id);
    assert.equal(path.length, 5);
    const graph = visibleGraph(snapshot, new Set(path), path[1]);
    assert.ok(graph.nodes.some(n => n.id === task.id));
    assert.deepEqual(graph.nodes.filter(n => n.level === 2).map(n => n.id), [path[1]]);
    const positions = starPositions(graph, path[1]);
    assert.ok(graph.nodes.every(n => positions.get(n.id)?.every(Number.isFinite)));
  }
});

test('relation toggle retains hierarchy and hides cross links', () => {
  const graph = visibleGraph(snapshot, new Set(snapshot.nodes.map(n => n.id)), '', false);
  assert.equal(graph.nodes.length, 392);
  assert.equal(graph.edges.length, 391);
  assert.ok(graph.edges.every(e => ['contains', 'belongs_to'].includes(e.relation_type)));
});

test('unknown ratings stay neutral and question counts scale within bounds', () => {
  const node = { ...snapshot.nodes.find(n => n.level === 3)!, importance: null, exam_frequency: null, difficulty: null };
  assert.equal(nodeColor(node), '#60a5fa');
  assert.ok(nodeSize({ ...node, question_count: 100 }) > nodeSize(node));
  assert.ok(nodeSize({ ...node, question_count: 1e9 }) <= 42);
});

test('expanded chapters keep separate depth columns and non-overlapping sibling rows', () => {
  for (const chapter of snapshot.nodes.filter(n => n.level === 2)) {
    const graph = visibleGraph(snapshot, new Set(snapshot.nodes.map(n => n.id)), chapter.id);
    const positions = starPositions(graph, chapter.id);
    for (const node of graph.nodes.filter(n => n.level >= 2)) {
      const [x, y] = positions.get(node.id)!;
      assert.equal(x, (node.level - 2) * 240);
      assert.ok(Number.isFinite(y));
      const children = tree.children.get(node.id) ?? [];
      const ys = children.map(id => positions.get(id)![1]);
      for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 92);
    }
    const columns = new Map<number, number[]>();
    for (const [x, y] of positions.values()) columns.set(x, [...(columns.get(x) ?? []), y]);
    for (const ys of columns.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 92);
    }
  }
});
