import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { assertStopped, projectRoot } from './project-data.mjs';

const target=resolve(process.argv[2]||''),allowed=resolve(projectRoot,'.wrangler/state/v3/d1'),rel=relative(allowed,target);
if(!process.argv[2]||!rel||rel.startsWith('..')||isAbsolute(rel)||!target.endsWith('.sqlite'))throw Error('Provide the verified project D1 SQLite path.');
await assertStopped(projectRoot);
const folder=resolve(projectRoot,'../outputs/统一题库解析备份-'+Date.now());await mkdir(folder,{recursive:true});
const db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON');
try{
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name!='canonical_question_explanations'").all().map(r=>r.name);
 const snapshot=()=>Object.fromEntries(names.map(n=>[n,createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+n+'" ORDER BY rowid').all())).digest('hex')]));
 const before=snapshot();await backup(db,resolve(folder,'before.sqlite'));
 const exists=db.prepare("SELECT name FROM sqlite_master WHERE name='canonical_question_explanations'").get();
 if(!exists){db.exec('BEGIN IMMEDIATE');try{db.exec(await readFile(resolve(projectRoot,'drizzle/0022_neat_omega_flight.sql'),'utf8'));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 const unchanged=JSON.stringify(before)===JSON.stringify(snapshot()),foreign=db.prepare('PRAGMA foreign_key_check').all(),integrity=db.prepare('PRAGMA integrity_check').get();
 const result={database:target,backup:resolve(folder,'before.sqlite'),applied:!exists,oldTablesUnchanged:unchanged,foreignKeys:foreign,integrity};
 await writeFile(resolve(folder,'migration-check.json'),JSON.stringify(result,null,2));
 if(!unchanged||foreign.length||integrity.integrity_check!=='ok')throw Error('Migration check failed. Backup retained.');
 console.log(JSON.stringify(result,null,2));
}finally{db.close();}
