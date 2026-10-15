import type { GraphMethod } from './knowledge-graph';

export function methodNetwork(methods: GraphMethod[], approved = false) {
  const nodes = methods.filter(m => m.content.strategy && !m.merged_into && m.evidenceValid && m.status !== 'rejected' && (!approved || m.status === 'approved'));
  const byKey = new Map(nodes.map(m => [m.content.strategy!.key, m]));
  const edges = nodes.flatMap(m => m.content.strategy!.links.flatMap(l => {
    const target = byKey.get(l.targetKey);
    return target ? [{ from: m.id, to: target.id, type: l.type, reason: l.reason, reviewed: m.status === 'approved' && target.status === 'approved' }] : [];
  }));
  return { nodes, edges };
}
export function methodNeighborhood(methods: GraphMethod[], centerId: string, expanded: string[], approved = false) {
  const graph = methodNetwork(methods, approved), visible = new Set([centerId, ...expanded]);
  for (const id of [centerId, ...expanded]) for (const e of graph.edges) if (e.from === id || e.to === id) { visible.add(e.from); visible.add(e.to); }
  return { nodes: graph.nodes.filter(n => visible.has(n.id)).slice(0,24), edges: graph.edges };
}
