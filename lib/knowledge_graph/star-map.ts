export type StarNode = {
  id: string; code: string; name: string; level: number; description: string;
  knowledge_review_status: 'pending' | 'approved'; updated_at: string;
  question_count: number; difficulty: number | null; importance: 'low' | 'medium' | 'high' | null;
  exam_frequency: 'low' | 'medium' | 'high' | null; source: string;
};
export type StarEdge = { id: string; source_id: string; target_id: string; relation_type: 'belongs_to' | 'contains' | 'prerequisite' | 'related' | 'advanced'; knowledge_review_status: 'pending' | 'approved'; updated_at: string };
export type StarSnapshot = { nodes: StarNode[]; edges: StarEdge[] };
export const levelLabels = ['', '学科模块', '章节', '核心知识点', '考试考点', '典型题型'];
export const relationLabels = { belongs_to: '归属', contains: '包含', prerequisite: '前置知识', related: '相关知识', advanced: '进阶知识' };

export function hierarchy(snapshot: StarSnapshot) {
  const byId = new Map(snapshot.nodes.map(n => [n.id, n]));
  const parent = new Map<string, string>(), children = new Map<string, string[]>();
  for (const e of snapshot.edges) {
    if (!['belongs_to', 'contains'].includes(e.relation_type)) continue;
    const [child, ancestor] = e.relation_type === 'belongs_to' ? [e.source_id, e.target_id] : [e.target_id, e.source_id];
    if (!byId.has(child) || !byId.has(ancestor)) continue;
    parent.set(child, ancestor);
    if (!children.has(ancestor)) children.set(ancestor, []);
    if (!children.get(ancestor)!.includes(child)) children.get(ancestor)!.push(child);
  }
  const path = (id: string) => {
    const result: string[] = [], seen = new Set<string>();
    let current: string | undefined = id;
    while (current && !seen.has(current)) { seen.add(current); result.unshift(current); current = parent.get(current); }
    return result;
  };
  return { byId, parent, children, path };
}

export function visibleGraph(snapshot: StarSnapshot, expanded: Set<string>, chapterId = '', crossLinks = true) {
  const tree = hierarchy(snapshot);
  const roots = snapshot.nodes.filter(n => !tree.parent.has(n.id) && (n.level === 1 || !chapterId));
  const visible = new Set<string>();
  const visit = (id: string) => {
    if (visible.has(id)) return;
    visible.add(id);
    if (!expanded.has(id)) return;
    for (const child of tree.children.get(id) ?? []) {
      if (chapterId && tree.byId.get(child)?.level === 2 && child !== chapterId) continue;
      visit(child);
    }
  };
  roots.forEach(n => visit(n.id));
  return {
    nodes: snapshot.nodes.filter(n => visible.has(n.id)),
    edges: snapshot.edges.filter(e => visible.has(e.source_id) && visible.has(e.target_id) && (crossLinks || ['belongs_to', 'contains'].includes(e.relation_type))),
  };
}

export function nodeColor(n: StarNode) {
  if (n.difficulty !== null && n.difficulty >= 4 && n.exam_frequency === 'high') return '#fb7185';
  if (n.importance === 'high') return '#fbbf24';
  return n.level === 1 ? '#c4b5fd' : '#60a5fa';
}
export function nodeSize(n: StarNode) { return (n.level === 1 ? 70 : n.level === 2 ? 36 : 20) + Math.min(22, Math.sqrt(Math.max(0, n.question_count)) * 3); }

/** Radial initial positions feed G6; each expanded chapter gets its own constellation. */
export function starPositions(snapshot: StarSnapshot, chapterId = '') {
  const tree = hierarchy(snapshot), result = new Map<string, [number, number]>();
  const roots = snapshot.nodes.filter(n => n.level === 1);
  roots.forEach(n => result.set(n.id, [0, 0]));
  const chapters = snapshot.nodes.filter(n => n.level === 2);
  const layoutBranch = (id: string, angle: number, radius: number, spread: number) => {
    result.set(id, [Math.cos(angle) * radius, Math.sin(angle) * radius]);
    const children = tree.children.get(id) ?? [];
    children.forEach((child, i) => layoutBranch(child, angle - spread / 2 + spread * (i + 0.5) / children.length, radius + 165, spread / Math.max(1, children.length)));
  };
  if (chapterId && tree.byId.has(chapterId)) {
    result.set(chapterId, [0, 0]);
    roots.forEach(n => result.set(n.id, [0, -125]));
    const concepts = tree.children.get(chapterId) ?? [];
    concepts.forEach((id, i) => layoutBranch(id, -Math.PI / 2 + (i + 0.5) * Math.PI * 2 / concepts.length, 255, Math.PI * 1.7 / concepts.length));
  } else {
    chapters.forEach((n, i) => layoutBranch(n.id, -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, chapters.length), 235, Math.PI * 1.6 / Math.max(1, chapters.length)));
  }
  snapshot.nodes.filter(n => !result.has(n.id)).forEach((n, i) => result.set(n.id, [410, i * 100]));
  return result;
}
