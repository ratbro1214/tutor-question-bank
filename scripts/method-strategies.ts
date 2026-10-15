import { DatabaseSync, backup } from 'node:sqlite';
import { readFile, readdir, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { coreStrategies, importCoreStrategies } from '../lib/method-strategies';
import { KnowledgeGraphStore } from '../lib/knowledge-graph-store';
import { sqliteD1 } from './sqlite-d1';
import { assertStopped, projectRoot } from './project-data.mjs';

const args=process.argv.slice(2), mode=args[0]||'--validate';
if (!['--validate','--preview','--database'].includes(mode) || (mode==='--database'?args.length!==4:args.length>1)) throw Error('Usage: node --import tsx scripts/method-strategies.ts [--validate | --preview | --database SQLITE_PATH OWNER SCOPE]');
if(mode==='--validate') {
  console.log(JSON.stringify({datasetId:coreStrategies.datasetId,cards:coreStrategies.cards.length,provenance:coreStrategies.provenance,reviewStatus:'candidate'},null,2));
} else {
  const run=`${Date.now()}-${process.pid}`, output=resolve(projectRoot,'../outputs/phase6',run);
  await mkdir(output,{recursive:true});
  let target: string, owner='phase6-preview',scope='phase6-preview';
  if(mode==='--database') {
    target=await realpath(resolve(args[1]));const allowed=await realpath(resolve(projectRoot,'.wrangler/state/v3/d1'));
    const rel=relative(allowed,target);
    if(!rel||rel.startsWith('..')||isAbsolute(rel)||!target.endsWith('.sqlite')||!(await stat(target)).isFile()) throw Error('Expected the verified existing local D1 SQLite path');
    owner=args[2];scope=args[3];await assertStopped(projectRoot);
  } else {
    const folder=resolve(projectRoot,'../work/phase6',run);await mkdir(folder,{recursive:true});target=resolve(folder,'preview.sqlite');
  }
  const db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON');
  try {
    if(mode==='--preview') {
      for(const file of (await readdir(resolve(projectRoot,'drizzle'))).filter(f=>f.endsWith('.sql')).sort()) db.exec(await readFile(resolve(projectRoot,'drizzle',file),'utf8'));
      db.prepare("INSERT INTO question_library_scopes(id,code,name,scope_type,kind,owner_principal_id,ownership_status) VALUES(?,?,?,'teacher_private','private',?,'known')").run(scope,scope,'Phase 6 isolated preview',owner);
      // Reuse the real catalog and taxonomy initialization, not alternative knowledge tables.
      const {seniorTaxonomy}=await import('../lib/senior-taxonomy');
      const {importKnowledgeCatalog}=await import('../lib/knowledge_graph/seed-store');
      for(const [code,name,chapter] of seniorTaxonomy) db.prepare('INSERT INTO knowledge_points(code,name,chapter_code) VALUES(?,?,?)').run(code,name,chapter);
      importKnowledgeCatalog(db,JSON.parse(await readFile(resolve(projectRoot,'data/knowledge_graph/senior-math-v1.json'),'utf8')));
    } else if (!db.prepare('SELECT id FROM question_library_scopes WHERE id=? AND owner_principal_id=?').get(scope,owner)) throw Error('Owner and scope do not match the local library');
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('math_graph_locks','math_methods','math_method_versions','math_knowledge_relations','math_relation_versions') ORDER BY name").all().map(r=>String(r.name));
    const snapshot=()=>Object.fromEntries(names.map(name=>[name,createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all())).digest('hex')]));
    const before=snapshot(), legacyMethods=db.prepare('SELECT * FROM math_methods ORDER BY id').all(), legacyRelations=db.prepare('SELECT * FROM math_knowledge_relations ORDER BY id').all();
    let backupPath: string|null=null;
    if(mode==='--database') {backupPath=resolve(output,'before.sqlite');await backup(db,backupPath);}
    const migrated=!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='uq_math_method_strategy_key'").get();
    if(migrated) db.exec(await readFile(resolve(projectRoot,'drizzle/0025_method_strategy_identity.sql'),'utf8'));
    const store=new KnowledgeGraphStore(sqliteD1(db),owner,[scope]);
    const plan=await importCoreStrategies(store,scope,true), first=await importCoreStrategies(store,scope), second=await importCoreStrategies(store,scope);
    const after=snapshot();
    const preserved=(rows:typeof legacyMethods,table:string)=>rows.every(row=>JSON.stringify(db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.id))===JSON.stringify(row));
    const integrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check, foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
    const oldTablesUnchanged=JSON.stringify(before)===JSON.stringify(after), oldCardsUnchanged=preserved(legacyMethods,'math_methods')&&preserved(legacyRelations,'math_knowledge_relations');
    if(!oldTablesUnchanged||!oldCardsUnchanged||second.inserted||second.relationsInserted||foreignKeys.length||integrity!=='ok') throw Error('Data preservation/idempotency check failed; backup retained');
    const statusCounts=db.prepare('SELECT status,count(*) count FROM math_methods WHERE owner_id=? AND scope_id=? GROUP BY status').all(owner,scope);
    const report={mode,database:target,backup:backupPath,migration:migrated?'0025_method_strategy_identity.sql':null,plan,first,second,oldTablesUnchanged,oldCardsUnchanged,before,after,statusCounts,foreignKeys,integrity};
    await writeFile(resolve(output,'import-verification.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,database:target,backup:backupPath,first:{inserted:first.inserted,relationsInserted:first.relationsInserted},second:{inserted:second.inserted,relationsInserted:second.relationsInserted},oldTablesUnchanged,oldCardsUnchanged,integrity},null,2));
  }finally{db.close();}
}
