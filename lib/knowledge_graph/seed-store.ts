import type { DatabaseSync } from 'node:sqlite';
import { validateCatalog, validateGraph, type GraphNode, type GraphEdge } from './catalog';

/** Offline SQLite adapter. Never import this module from a Cloudflare route. */
export function importKnowledgeCatalog(db: DatabaseSync, input: unknown) {
  const catalog = validateCatalog(input);
  if (db.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1) throw Error('Foreign keys must be enabled');
  const result = { datasetId: catalog.dataset_id, insertedNodes: 0, preservedNodes: 0, insertedEdges: 0, preservedEdges: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    const findNode = db.prepare('SELECT * FROM knowledge_nodes WHERE id=? OR (subject=? AND stage=? AND curriculum_version=? AND code=?)');
    const insertNode = db.prepare(`INSERT INTO knowledge_nodes
      (id,code,name,subject,stage,curriculum_version,level,description,difficulty,importance,exam_frequency,metadata,knowledge_review_status,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending','seed')`);
    for (const n of catalog.nodes) {
      const matches = findNode.all(n.id, n.subject, n.stage, n.curriculum_version, n.code);
      if (matches.length) {
        const old = matches[0];
        if (matches.length !== 1 || old.id !== n.id || old.code !== n.code || old.subject !== n.subject || old.stage !== n.stage || old.curriculum_version !== n.curriculum_version || old.level !== n.level || old.source !== 'seed' || JSON.parse(String(old.metadata)).dataset_id !== catalog.dataset_id) {
          throw Error(`Node identity conflict: ${n.code}`);
        }
        // Preserve teacher descriptions, labels, ratings, review decisions and timestamps.
        result.preservedNodes++;
      } else {
        insertNode.run(n.id, n.code, n.name, n.subject, n.stage, n.curriculum_version, n.level, n.description, n.difficulty, n.importance, n.exam_frequency, JSON.stringify(n.metadata));
        result.insertedNodes++;
      }
    }
    const findEdge = db.prepare('SELECT * FROM knowledge_edges WHERE id=? OR (source_id=? AND target_id=? AND relation_type=?)');
    const insertEdge = db.prepare(`INSERT INTO knowledge_edges(id,source_id,target_id,relation_type,description,knowledge_review_status,source) VALUES (?,?,?,?,?,'pending','seed')`);
    for (const e of catalog.edges) {
      const matches = findEdge.all(e.id, e.source_id, e.target_id, e.relation_type);
      if (matches.length) {
        const old = matches[0];
        if (matches.length !== 1 || old.id !== e.id || old.source_id !== e.source_id || old.target_id !== e.target_id || old.relation_type !== e.relation_type || old.source !== 'seed') throw Error(`Edge identity conflict: ${e.id}`);
        result.preservedEdges++;
      } else {
        insertEdge.run(e.id, e.source_id, e.target_id, e.relation_type, e.description);
        result.insertedEdges++;
      }
    }
    // Include existing relationships so edits cannot introduce an undetected cycle.
    const nodes = db.prepare('SELECT id,level,subject,stage,curriculum_version FROM knowledge_nodes').all() as GraphNode[];
    const edges = db.prepare('SELECT id,source_id,target_id,relation_type FROM knowledge_edges').all() as GraphEdge[];
    validateGraph(nodes, edges);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
