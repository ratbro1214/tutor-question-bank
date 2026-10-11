// Offline additive migration; never touches R2 or user question contents.
import { DatabaseSync,backup } from 'node:sqlite';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { assertStopped,projectRoot } from './project-data.mjs';

const file=process.argv[2];if(!file)throw Error('Provide the verified local D1 SQLite path.');
const target=resolve(file),allowed=resolve(projectRoot,'.wrangler/state/v3/d1');
if(!target.startsWith(allowed+'\\')&&!target.startsWith(allowed+'/'))throw Error('Database must be inside this project local D1 directory.');
await assertStopped(projectRoot);
const out=resolve(projectRoot,'../outputs'),folder=resolve(out,'5B-2-数据库备份-'+Date.now());await mkdir(folder,{recursive:true});
const db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON');
const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all().map(r=>r.name);
const snapshot=()=>Object.fromEntries(names.map(n=>[n,{count:db.prepare('SELECT count(*) n FROM "'+n+'"').get().n,hash:createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+n+'" ORDER BY rowid').all())).digest('hex')}]));
try{
 const before=snapshot();await backup(db,resolve(folder,'before.sqlite'));
 const has=db.prepare("SELECT name FROM sqlite_master WHERE name='paper_solution_sources'").get();
 const lease=has&&db.prepare('PRAGMA table_info(paper_solution_reviews)').all().some(r=>r.name==='lease_token');
 const migrations=[...(!has?['0018_dashing_bloodaxe.sql']:[]),...(!lease?['0019_superb_starhawk.sql']:[])];
 db.exec('BEGIN IMMEDIATE');try{for(const name of migrations)db.exec(await readFile(resolve(projectRoot,'drizzle',name),'utf8'));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 const after=snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after),foreign=db.prepare('PRAGMA foreign_key_check').all(),integrity=db.prepare('PRAGMA integrity_check').get();
 if(!unchanged||foreign.length||integrity.integrity_check!=='ok')throw Error('Post-migration integrity or preservation check failed; backup retained.');
 const report={database:target,backup:resolve(folder,'before.sqlite'),migrations,oldTablesUnchanged:unchanged,before,after,foreignKeys:foreign,integrity};
 await writeFile(resolve(out,'5B-2-迁移核验.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({migrations,backup:report.backup,oldTablesUnchanged:unchanged,integrity},null,2));
}finally{db.close();}
