import { z } from 'zod';
import core from '../data/method-strategies/core-v2.json';
import catalog from '../data/knowledge_graph/senior-math-v1.json';
import { seniorTaxonomy } from './senior-taxonomy';
import { methodContentSchema, similarMethods, type GraphMethod } from './knowledge-graph';
import type { KnowledgeGraphStore } from './knowledge-graph-store';

export const strategyDatasetSchema = z.object({
  schemaVersion: z.literal(2), datasetId: z.string().min(1).max(80), provenance: z.string().min(1).max(1000),
  cards: z.array(methodContentSchema.extend({ strategy: methodContentSchema.shape.strategy.unwrap() })).min(1).max(150),
}).strict();
export function validateStrategyDataset(raw: unknown) {
  const data = strategyDatasetSchema.parse(raw);
  const keys = new Set(data.cards.map(c => c.strategy.key));
  if (keys.size !== data.cards.length || new Set(data.cards.map(c => c.name.normalize('NFKC').trim())).size !== data.cards.length) throw Error('策略键或名称重复。');
  const legacyCodes = new Set<string>(seniorTaxonomy.map(k => k[0])), catalogCodes = new Set(catalog.nodes.map(n => n.code));
  for (const card of data.cards) {
    if (card.strategy.knowledgeCodes.some(c => !legacyCodes.has(c)) || card.strategy.catalogCodes.some(c => !catalogCodes.has(c))) throw Error('策略引用了未知知识编码。');
    if (card.strategy.links.some(l => !keys.has(l.targetKey))) throw Error('策略关系存在悬空目标。');
  }
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key)) throw Error('先修方法形成循环。');
    if (done.has(key)) return;
    visiting.add(key);
    for (const l of data.cards.find(c => c.strategy.key === key)!.strategy.links.filter(l => l.type === 'prerequisite')) visit(l.targetKey);
    visiting.delete(key); done.add(key);
  }
  for (const key of keys) visit(key);
  return data;
}
export const coreStrategies = validateStrategyDataset(core);

export function strategyImportPlan(existing: GraphMethod[]) {
  return coreStrategies.cards.map(content => {
    const sameKey = existing.filter(m => m.content.strategy?.key === content.strategy.key || m.source.seedKey === `${coreStrategies.datasetId}/${content.strategy.key}`);
    const sameName = existing.filter(m => m.content.name.normalize('NFKC').trim() === content.name.normalize('NFKC').trim());
    return { key: content.strategy.key, name: content.name, action: sameKey.length || sameName.length ? 'preserve' as const : 'insert' as const,
      existingIds: [...new Set([...sameKey, ...sameName].map(m => m.id))],
      legacy: existing.filter(m => content.strategy.legacyNames.includes(m.content.name)).map(m => ({ id: m.id, name: m.content.name })),
      similar: similarMethods(content, existing), status: 'candidate' as const };
  });
}
async function stableId(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function importCoreStrategies(store: KnowledgeGraphStore, scopeId: string, preview = false) {
  const existing = await store.methods(false, scopeId);
  const merged = (await store.db.prepare('SELECT id FROM math_methods WHERE owner_id=? AND scope_id=? AND merged_into IS NOT NULL').bind(store.owner, scopeId).all<{ id: string }>()).results;
  for (const m of merged) existing.push(await store.getMethod(m.id));
  const plan = strategyImportPlan(existing);
  const codes=[...new Set(coreStrategies.cards.flatMap(c=>c.strategy.knowledgeCodes))];
  const existingCodes=(await store.db.prepare(`SELECT code FROM knowledge_points WHERE code IN (${codes.map(()=>'?').join(',')})`).bind(...codes).all<{code:string}>()).results.map(r=>r.code);
  const missingKnowledgeCodes=codes.filter(code=>!existingCodes.includes(code));
  if (preview) return { datasetId: coreStrategies.datasetId, provenance: coreStrategies.provenance, plan, missingKnowledgeCodes, inserted: 0, preserved: plan.filter(p => p.action === 'preserve').length, relationsInserted: 0 };
  let inserted = 0, relationsInserted = 0;
  for (const entry of plan) {
    if (entry.action !== 'insert') continue;
    const content = coreStrategies.cards.find(c => c.strategy.key === entry.key)!;
    const id = await stableId(JSON.stringify([store.owner, scopeId, coreStrategies.datasetId, entry.key]));
    await store.writeMethod(id, { operationId: crypto.randomUUID(), expectedRevision: 0, scopeId, status: 'candidate', content,
      source: { origin: 'pilot', seedKey: `${coreStrategies.datasetId}/${entry.key}`, note: coreStrategies.provenance, evidence: null } });
    inserted++;
  }
  // Each card and relation uses the existing transactional CAS store. Partial failure is retryable:
  // subsequent imports preserve all teacher edits, decisions and versions, including rejected cards.
  const current = await store.methods(false, scopeId), relations = await store.relations(false, scopeId);
  for (const card of coreStrategies.cards) {
    const method = current.find(m => m.content.strategy?.key === card.strategy.key);
    if (!method) continue; // Same-name legacy card was preserved; no unreviewed mapping is invented.
    for (const code of card.strategy.knowledgeCodes) {
      const kp = await store.db.prepare('SELECT id FROM knowledge_points WHERE code=?').bind(code).first<{ id: number }>();
      if (!kp || relations.some(r => r.type === 'applies' && r.method_id === method.id && r.to_knowledge === kp.id)) continue;
      await store.writeRelation(await stableId(JSON.stringify([store.owner, scopeId, method.id, code])), {
        operationId: crypto.randomUUID(), expectedRevision: 0, scopeId, status: 'candidate', type: 'applies', fromKnowledge: null, toKnowledge: kp.id,
        methodId: method.id, canonicalId: null, revisionId: null,
        source: { origin: 'pilot', note: '核心策略的知识点适用建议；待教师独立审核', evidence: null },
      }); relationsInserted++;
    }
  }
  return { datasetId: coreStrategies.datasetId, provenance: coreStrategies.provenance, plan, missingKnowledgeCodes, inserted, preserved: plan.length - inserted, relationsInserted };
}

