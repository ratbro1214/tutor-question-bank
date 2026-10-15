import { z } from 'zod';

const label = z.string().trim().min(1);
const rating = z.enum(['low', 'medium', 'high']).nullable();
const nodeSchema = z.object({
  id: label, code: label, name: label, subject: label, stage: label, curriculum_version: label,
  level: z.number().int().min(1).max(5), description: label,
  difficulty: z.number().int().min(1).max(5).nullable(), importance: rating, exam_frequency: rating,
  knowledge_review_status: z.literal('pending'), source: z.literal('seed'),
  metadata: z.object({ dataset_id: label, editorial_status: z.literal('draft'), provenance: label }).strict(),
}).strict();
const edgeSchema = z.object({
  id: label, source_id: label, target_id: label,
  relation_type: z.enum(['belongs_to', 'contains', 'prerequisite', 'related', 'advanced']),
  description: label, knowledge_review_status: z.literal('pending'), source: z.literal('seed'),
}).strict();
export const catalogSchema = z.object({
  schema_version: z.literal(1), dataset_id: label, title: label, subject: label, stage: label, curriculum_version: label,
  coverage_note: label, rating_note: label,
  references: z.array(z.object({ title: label, url: z.string().url(), usage: label }).strict()).min(1),
  nodes: z.array(nodeSchema).min(1), edges: z.array(edgeSchema),
}).strict();
export type KnowledgeCatalog = z.infer<typeof catalogSchema>;
export type CatalogNode = KnowledgeCatalog['nodes'][number];
export type CatalogEdge = KnowledgeCatalog['edges'][number];
export type GraphNode = Pick<CatalogNode, 'id' | 'level' | 'subject' | 'stage' | 'curriculum_version'>;
export type GraphEdge = Pick<CatalogEdge, 'id' | 'source_id' | 'target_id' | 'relation_type'>;

function noCycles(adjacency: Map<string, Set<string>>, kind: string) {
  // Kahn's algorithm avoids stack overflow on future large catalogs.
  const indegree = new Map<string, number>();
  for (const [from, targets] of adjacency) {
    if (!indegree.has(from)) indegree.set(from, 0);
    for (const to of targets) indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const ready = [...indegree].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  for (let i = 0; i < ready.length; i++) {
    visited++;
    for (const to of adjacency.get(ready[i]) ?? []) {
      const remaining = indegree.get(to)! - 1;
      indegree.set(to, remaining);
      if (remaining === 0) ready.push(to);
    }
  }
  if (visited !== indegree.size) throw Error(`${kind}: cycle detected`);
}

/** Structural checks also run on the transaction's merged graph, including preserved edits. */
export function validateGraph(nodes: GraphNode[], edges: GraphEdge[], complete = false) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw Error('Duplicate node id');
  const edgeIds = new Set<string>(), identities = new Set<string>(), hierarchy = new Set<string>();
  const parent = new Map<string, string>(), children = new Map<string, Set<string>>();
  const dependencies = new Map<string, Set<string>>();
  const connect = (map: Map<string, Set<string>>, from: string, to: string) => {
    if (!map.has(from)) map.set(from, new Set());
    map.get(from)!.add(to);
  };
  for (const e of edges) {
    if (edgeIds.has(e.id)) throw Error(`Duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);
    const key = JSON.stringify([e.source_id, e.target_id, e.relation_type]);
    if (identities.has(key)) throw Error(`Duplicate edge: ${e.id}`);
    identities.add(key);
    const from = byId.get(e.source_id), to = byId.get(e.target_id);
    if (!from || !to) throw Error(`Missing endpoint: ${e.id}`);
    if (from.id === to.id) throw Error(`Self edge: ${e.id}`);
    if (from.subject !== to.subject || from.stage !== to.stage || from.curriculum_version !== to.curriculum_version) {
      throw Error(`Cross-curriculum edge: ${e.id}`);
    }
    if (e.relation_type === 'belongs_to' || e.relation_type === 'contains') {
      const [child, ancestor] = e.relation_type === 'belongs_to' ? [from, to] : [to, from];
      if (child.level !== ancestor.level + 1) throw Error(`Non-adjacent hierarchy levels: ${e.id}`);
      const pair = JSON.stringify([child.id, ancestor.id]);
      if (hierarchy.has(pair)) throw Error(`Duplicate inverse hierarchy: ${e.id}`);
      hierarchy.add(pair);
      if (parent.has(child.id)) throw Error(`Multiple hierarchy parents: ${child.id}`);
      parent.set(child.id, ancestor.id);
      connect(children, ancestor.id, child.id);
    } else if (e.relation_type === 'related') {
      if (e.source_id > e.target_id) throw Error(`Related endpoints must be sorted: ${e.id}`);
    } else if (e.relation_type === 'prerequisite') {
      connect(dependencies, from.id, to.id);
    } else if (e.relation_type === 'advanced') {
      connect(dependencies, to.id, from.id);
    } else {
      throw Error(`Unsupported relation: ${e.id}`);
    }
  }
  noCycles(children, 'Hierarchy');
  noCycles(dependencies, 'Prerequisite/advanced');
  if (complete) {
    if (nodes.filter(n => n.level === 1).length !== 1) throw Error('Catalog must have exactly one root');
    for (const n of nodes) {
      if (n.level > 1 && !parent.has(n.id)) throw Error(`Orphan node: ${n.id}`);
      if (n.level < 5 && !children.get(n.id)?.size) throw Error(`Missing next-level content: ${n.id}`);
    }
  }
  return { parent, children };
}

export function validateCatalog(input: unknown): KnowledgeCatalog {
  const catalog = catalogSchema.parse(input);
  const codes = new Set<string>();
  for (const node of catalog.nodes) {
    if (codes.has(node.code)) throw Error(`Duplicate code: ${node.code}`);
    codes.add(node.code);
    if (node.subject !== catalog.subject || node.stage !== catalog.stage || node.curriculum_version !== catalog.curriculum_version) throw Error(`Catalog identity mismatch: ${node.code}`);
    if (node.metadata.dataset_id !== catalog.dataset_id || node.id !== `kg:${catalog.dataset_id}:${node.code}`) throw Error(`Unstable seed identity: ${node.code}`);
  }
  validateGraph(catalog.nodes, catalog.edges, true);
  return catalog;
}

export function summarizeCatalog(input: unknown) {
  const catalog = validateCatalog(input);
  const { children } = validateGraph(catalog.nodes, catalog.edges, true);
  const descendants = (id: string): number => 1 + [...(children.get(id) ?? [])].reduce((n, child) => n + descendants(child), 0);
  return {
    datasetId: catalog.dataset_id, nodes: catalog.nodes.length, edges: catalog.edges.length,
    levels: Object.fromEntries([1, 2, 3, 4, 5].map(level => [level, catalog.nodes.filter(n => n.level === level).length])),
    relations: Object.fromEntries(['belongs_to', 'contains', 'prerequisite', 'related', 'advanced'].map(type => [type, catalog.edges.filter(e => e.relation_type === type).length])),
    chapters: catalog.nodes.filter(n => n.level === 2).map(n => ({ code: n.code, name: n.name, nodes: descendants(n.id) })),
    reviewStatus: 'pending',
  };
}
