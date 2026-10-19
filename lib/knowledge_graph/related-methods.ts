import type { GraphMethod, MethodContent } from '../knowledge-graph';
import type { OpenMathCatalog } from '../open-math';
import { hierarchy, type StarNode, type StarSnapshot } from './star-map';

export type RelatedMethod = {
  id: string; content: MethodContent; origin: 'teacher' | 'public';
  status: 'approved' | 'candidate' | 'reference'; match: string; direct: boolean;
  source: string; sourceUrl?: string; evidenceId?: string;
};

/** Use explicit catalog mappings and named topics; never search arbitrary JSON for a code. */
export function relatedMethods(node: StarNode, snapshot: StarSnapshot, methods: GraphMethod[], catalog: OpenMathCatalog, approvedOnly = false): RelatedMethod[] {
  const tree = hierarchy(snapshot), path = tree.path(node.id);
  const ancestors = path.map(id => tree.byId.get(id)!).filter(n => n.level >= 2 && n.id !== node.id);
  const chapter = path.map(id => tree.byId.get(id)!).find(n => n.level === 2);
  const result: RelatedMethod[] = [];
  for (const method of methods) {
    if (!method.evidenceValid || method.merged_into || method.status === 'rejected' || (approvedOnly && method.status !== 'approved')) continue;
    const mapped = method.content.strategy?.catalogCodes ?? [];
    const names = method.content.knowledgePoints ?? [];
    let match = '', direct = false;
    if (mapped.includes(node.code) || names.includes(node.name)) { match = '当前知识匹配'; direct = true; }
    else if (snapshot.nodes.some(n => mapped.includes(n.code) && tree.path(n.id).includes(node.id))) { match = '下级知识匹配'; direct = true; }
    else if (ancestors.some(n => mapped.includes(n.code) || names.includes(n.name))) match = '上级知识参考';
    if (!match) continue;
    result.push({ id: `teacher:${method.id}`, content: method.content, origin: 'teacher', status: method.status, match, direct, source: method.source.note, evidenceId: method.source.evidence?.canonicalId });
  }
  // Public references have no teacher approval state, so they stay out of the approved view.
  if (!approvedOnly) for (const method of catalog.methods.filter(m => m.stage === '高中')) {
    const topicNames = catalog.topics.filter(t => method.topicIds.includes(t.id)).map(t => t.name);
    const names = [...topicNames, ...(method.content.knowledgePoints ?? []), ...method.content.typicalProblems];
    const direct = names.includes(node.name);
    const parentMatch = ancestors.some(n => n.level >= 3 && names.includes(n.name));
    if (!direct && !parentMatch && (!chapter || method.chapter !== chapter.name)) continue;
    result.push({ id: `public:${method.id}`, content: method.content, origin: 'public', status: 'reference', direct, match: direct ? '当前知识参考' : parentMatch ? '上级知识参考' : '同章参考 · 非当前题型匹配', source: `${method.source.repository} · ${method.source.license}`, sourceUrl: method.source.url });
  }
  return result.sort((a, b) => Number(b.direct) - Number(a.direct) || Number(b.status === 'approved') - Number(a.status === 'approved') || a.content.name.localeCompare(b.content.name, 'zh-CN'));
}
