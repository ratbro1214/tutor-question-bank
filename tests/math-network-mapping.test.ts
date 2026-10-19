import assert from 'node:assert/strict';
import test from 'node:test';
import data from '../data/math-network/project-crosswalk.json';
import network from '../data/math-network/knowledge-network.json';
import seed from '../data/knowledge_graph/senior-math-v1.json';
import { seniorTaxonomy, seniorChapters } from '../lib/senior-taxonomy';
import { projectNetworkMapping, normalizeNetworkLabel } from '../lib/math-network-mapping';

test('radians links to the broader angle classification without claiming equivalence', () => {
 const row=projectNetworkMapping('kp:21098');
 assert.equal(row?.sourceName,'弧度制');
 assert.deepEqual(row?.knowledgeCodes.map(k=>[k.code,k.basis]),[['HS-TRIG-ANGLE','curated_component']]);
 assert.equal(row?.chapters[0].code,'HS-TRIG-FUNCTION');
 assert.equal(projectNetworkMapping('kp:21098-extra'),undefined);
});
test('the crosswalk uses existing senior codes and source IDs, with no dangling catalog links', () => {
 const sources=new Set(network.nodes.map(n=>n.id)), codes=new Set<string>(seniorTaxonomy.map(k=>k[0])), chapters=new Set<string>(seniorChapters.map(c=>c[0]));
 const catalog=new Map(seed.nodes.map(n=>[n.id,n]));
 assert.equal(new Set(data.mappings.map(m=>m.sourceId)).size,data.mappings.length);
 for(const row of data.mappings){
  assert.ok(sources.has(row.sourceId));
  for(const kp of row.knowledgeCodes)assert.ok(codes.has(kp.code));
  for(const c of row.chapters)assert.ok(chapters.has(c.code));
  for(const n of row.catalogNodes)assert.equal(normalizeNetworkLabel(row.sourceName),normalizeNetworkLabel(catalog.get(n.id)!.name));
 }
});
test('unmatched knowledge remains unmatched instead of inheriting chapter-level equivalence', () => {
 const unmapped=data.mappings.find(m=>!m.knowledgeCodes.length&&!m.catalogNodes.length&&m.chapters.length);
 assert.ok(unmapped);
 assert.equal(projectNetworkMapping(unmapped.sourceId)?.knowledgeCodes.length,0);
 assert.equal(projectNetworkMapping('unknown-node'),undefined);
});
