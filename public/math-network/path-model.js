/* Shared graph traversal. Accepted imported relationships are included by default.
 * The explicit false argument is retained only for local provenance comparisons. */
(function (root) {
  'use strict';
  function eligible(edge, includeSource = true) {
    return edge.type === 'PREREQUISITE_OF' && edge.active !== false &&
      (edge.status === 'editorial_proposal' || (includeSource && edge.status === 'source_asserted'));
  }
  function validate(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return {ok:false, reason:'missing'};
    const ids = new Set(graph.nodes.map(n => n.id));
    const counts = graph.metadata?.counts;
    const ok = graph.nodes.length > 0 && ids.size === graph.nodes.length &&
      counts?.nodes === graph.nodes.length && counts?.edges === graph.edges.length &&
      graph.edges.every(e => ids.has(e.source) && ids.has(e.target));
    return {ok, reason:ok?'complete':'incomplete'};
  }
  function create(nodes, edges) {
    const ids = new Set(nodes.map(n => n.id));
    const incoming = new Map(), outgoing = new Map();
    for (const edge of edges) {
      if (!eligible(edge, true) || !ids.has(edge.source) || !ids.has(edge.target)) continue;
      for (const [map, key] of [[incoming, edge.target], [outgoing, edge.source]]) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(edge);
      }
    }
    function walk(id, direction, depth = 1, includeSource = true) {
      if (!ids.has(id)) return [];
      const map = direction === 'before' ? incoming : outgoing;
      const seen = new Set([id]), queue = [{ id, distance: 0, trail: [] }], results = [];
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (current.distance >= depth) continue;
        const candidates = (map.get(current.id) || []).filter(e => eligible(e, includeSource))
          .slice().sort((a,b) => Number(a.status === 'source_asserted') - Number(b.status === 'source_asserted'));
        for (const edge of candidates) {
          const next = direction === 'before' ? edge.source : edge.target;
          if (seen.has(next)) continue;
          seen.add(next);
          const result = { id: next, distance: current.distance + 1, via: current.id, edge, trail: [...current.trail, edge] };
          results.push(result); queue.push(result);
        }
      }
      return results;
    }
    return { walk };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create, eligible, validate };
  else root.KnowledgePath = { create, eligible, validate };
})(typeof window === 'undefined' ? {} : window);
