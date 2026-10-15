import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { realpath, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { coreStrategies } from '../lib/method-strategies';
import type { GraphMethod } from '../lib/knowledge-graph';
import { decideStrategies } from '../lib/strategy-decision';
import { methodNeighborhood } from '../lib/method-network';
import { projectRoot } from './project-data.mjs';

// Live mode uses the already running application API, never opens SQLite for writes.
const live=process.argv.slice(2).includes('--live');
const args=process.argv.slice(2),baselineIndex=args.indexOf('--baseline'),baselinePath=baselineIndex>=0?args[baselineIndex+1]:undefined;
if(args.some((a,i)=>a!=='--live'&&a!=='--baseline'&&i!==baselineIndex+1) || (baselineIndex>=0&&!baselinePath)) throw Error('Usage: node --import tsx scripts/accept-method-strategies.ts [--live] [--baseline BACKUP_PATH]');
const folder=resolve(projectRoot,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files=(await readdir(folder)).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
if(files.length!==1) throw Error('Expected exactly one verified business D1 database');
const target=await realpath(resolve(folder,files[0])), rel=relative(await realpath(folder),target);
if(!rel||rel.startsWith('..')||isAbsolute(rel)) throw Error('Database target escaped local D1');
const output=resolve(projectRoot,'../outputs/phase6',`acceptance-${Date.now()}`);await mkdir(output,{recursive:true});
const db=new DatabaseSync(target,{readOnly:true});
const hash=(rows:unknown)=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
// _cf_METADATA is the Workers/D1 bookmark counter, not an application data table.
const protectedTables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('math_methods','math_method_versions','math_knowledge_relations','math_relation_versions','math_graph_locks') ORDER BY name").all().map(r=>String(r.name));
const snapshot=(connection=db)=>Object.fromEntries(protectedTables.map(name=>[name,hash(connection.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all())]));
try {
  const baseline=baselinePath?new DatabaseSync(await realpath(resolve(baselinePath)),{readOnly:true}):db;
  const before=snapshot(baseline), oldMethods=baseline.prepare('SELECT * FROM math_methods ORDER BY id').all(), oldRelations=baseline.prepare('SELECT * FROM math_knowledge_relations ORDER BY id').all();
  if(baseline!==db)baseline.close();
  let imports: unknown=null, backupPath: string|null=null;
  if(live) {
    const base='http://localhost:5173';
    const list=await fetch(base+'/api/knowledge-graph/methods?approved=false',{signal:AbortSignal.timeout(20000)});
    if(!list.ok) throw Error('Existing application unavailable; do not start another server');
    const existing=(await list.json() as {items:GraphMethod[]}).items;
    const scopeId=existing[0]?.scope_id;
    if(!scopeId||!db.prepare('SELECT 1 FROM question_library_scopes WHERE id=?').get(scopeId)) throw Error('Cannot confirm live library scope');
    backupPath=resolve(output,'before.sqlite');await backup(db,backupPath);
    const invoke=async(action:string)=>{
      const response=await fetch(base+'/api/knowledge-graph/strategies',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action,scopeId}),signal:AbortSignal.timeout(60000)});
      const result=await response.json() as {error?:string;inserted:number;relationsInserted:number};if(!response.ok||result.error) throw Error(result.error||'Live import failed');return result;
    };
    const preview=await invoke('preview'),first=await invoke('import'),second=await invoke('import');
    if(second.inserted||second.relationsInserted) throw Error('Live import not idempotent');
    imports={preview,first,second};
  }
  const methods:GraphMethod[]=coreStrategies.cards.map(c=>({id:c.strategy.key,scope_id:'offline-evaluation',revision:1,status:'candidate',content:c,source:{origin:'pilot',note:'Evaluation draft',evidence:null},merged_into:null,updated_at:'now',evidenceValid:true}));
  const cases=[
    {id:'a4b9632f-e9d7-5c53-a76a-f3d3f2a20f24',kind:'log-parameter',expected:'p-equality-parameter'},
    {id:'f14916af-e005-5f7d-a5c4-ab20a3f30275',kind:'derivative-domain',expected:'p-domain-degree'},
    {id:'c146a5d0-ccaf-5579-a144-037725f9b4e5',kind:'two-zeros',expected:'p-extremum-zero'},
    {id:'abd9cd55-0478-557c-a957-8379373cb87d',kind:'functional-identity',expected:'p-domain-degree'},
    {id:'de194ce9-ac04-5501-a484-7d753aae2967',kind:'recurrence-transfer',expected:null},
    {id:'eea0ee37-c28a-5c46-abc9-4f4e4e0359d0',kind:'damaged-inequality',expected:'empty'},
    {id:'c04f7aad-f98b-5f40-a0b4-9858da7b697c',kind:'damaged-geometry',expected:'empty'},
    {id:'c6bcad00-8253-4922-b65a-dc120ce67bd3',kind:'spatial-geometry-control',expected:'empty'},
    {id:'da46db07-f038-4ed4-8698-a13ff7891d98',kind:'trigonometry-control',expected:'empty'},
    {id:'cefadcdc-cf27-5d9c-aa2e-6e2ad460d25e',kind:'conic-control',expected:'empty'},
  ];
  const samples=cases.map(c=>{
    const q=db.prepare('SELECT q.id,q.scope_id,q.current_revision_id,r.original_text FROM canonical_questions q JOIN canonical_question_revisions r ON r.id=q.current_revision_id WHERE q.id=?').get(c.id);
    if(!q) return {...c,passed:false,error:'Expected local canonical question missing; no sample fabricated'};
    const start=performance.now(),result=decideStrategies(String(q.original_text),methods),elapsedMs=performance.now()-start;
    const passed=!result.items.some(i=>i.verdict==='preferred')&&(c.expected==='empty'?result.items.length===0:c.expected===null||result.items.some(i=>i.key===c.expected));
    return {...c,scopeId:q.scope_id,revisionId:q.current_revision_id,textHash:hash(q.original_text),text:String(q.original_text),elapsedMs,passed,result};
  });
  const start=performance.now();for(let i=0;i<1000;i++)methodNeighborhood(methods,methods[i%23].id,[]);
  const network1000Ms=performance.now()-start,after=snapshot();
  const preserved=(rows:typeof oldMethods,table:string)=>rows.every(row=>hash(row)===hash(db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.id)));
  const oldTablesUnchanged=hash(before)===hash(after),oldCardsUnchanged=preserved(oldMethods,'math_methods')&&preserved(oldRelations,'math_knowledge_relations');
  const indexApplied=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='uq_math_method_strategy_key'").get());
  const report={database:target,live,backup:backupPath,baseline:baselinePath||null,imports,samples,passed:samples.every(s=>s.passed)&&oldTablesUnchanged&&oldCardsUnchanged,oldTablesUnchanged,oldCardsUnchanged,before,after,indexApplied,network1000Ms,
    caveat:'真实题目用于检查召回与保守行为；包含乱码和专题外负例。不是专家标注推荐准确率；没有真实学生数据或符号证明引擎。',
    statusCounts:db.prepare("SELECT status,count(*) count FROM math_methods WHERE json_extract(content,'$.strategy.version')=2 GROUP BY status").all(),
    integrity:db.prepare('PRAGMA integrity_check').get(),foreignKeys:db.prepare('PRAGMA foreign_key_check').all()};
  await writeFile(resolve(output,'question-acceptance.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,passed:report.passed,samples:samples.map(s=>({kind:s.kind,passed:s.passed})),oldTablesUnchanged,oldCardsUnchanged,indexApplied,network1000Ms,statusCounts:report.statusCounts},null,2));
  if(!report.passed)process.exitCode=1;
}finally{db.close();}
