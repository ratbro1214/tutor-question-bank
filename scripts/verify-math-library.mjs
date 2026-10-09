// Opt-in read-only acceptance against the existing local D1 and running app.
// node scripts/verify-math-library.mjs [http://localhost:5173]
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const db=new DatabaseSync(join(dir,readdirSync(dir).find(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite')),{readOnly:true});
const origin=process.argv[2]||'http://localhost:5173';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'This check only signs in to the existing local development app.');
const hash=v=>createHash('sha256').update(v).digest('hex');
function snapshot(){
 const tables=['canonical_questions','canonical_question_revisions','question_library_scopes','question_occurrences','question_module_links','source_documents','papers','paper_questions','questions','question_explanations','inquiries'];
 const database=Object.fromEntries(tables.map(t=>[t,hash(JSON.stringify(db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()))]));
 const files={};function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(!/sqlite(?:-wal|-shm)?$/.test(e.name))files[p]=hash(readFileSync(p));}}walk(join(root,'.wrangler/state/v3/r2'));return {database,r2:files};
}
const before=snapshot(),checks=[];
const signIn=await fetch(origin+'/signin-with-chatgpt?return_to=/math-library',{redirect:'manual'});
assert.equal(signIn.status,302);const cookie=signIn.headers.get('set-cookie').split(';')[0];
async function api(path,status=200,auth=true){const r=await fetch(origin+path,{headers:auth?{cookie}:{}});assert.equal(r.status,status,path);return r.headers.get('content-type')?.includes('application/json')?r.json():r;}
const scope=db.prepare("SELECT id FROM question_library_scopes WHERE code='project-private' AND owner_principal_id='project_owner' AND kind='private'").get();assert.ok(scope);
const current=db.prepare(`SELECT c.id,r.original_text,q.classification,p.title,p.id paperId FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id JOIN question_module_links l ON l.canonical_question_id=c.id JOIN paper_questions q ON q.id=l.module_record_id JOIN papers p ON p.id=q.paper_id WHERE c.scope_id=? AND c.subject='math' AND c.status IN ('active','provisional') AND q.question_text=r.original_text`).all(scope.id).map(r=>({...r,classification:JSON.parse(r.classification)}));
const expectedIds=new Set(db.prepare("SELECT id FROM canonical_questions WHERE scope_id=? AND subject='math' AND current_revision_id IS NOT NULL AND status IN ('active','provisional')").all(scope.id).map(r=>r.id));
const all=await api('/api/math-library?pageSize=50');assert.equal(all.total,expectedIds.size);assert.deepEqual(new Set(all.items.map(r=>r.id)),expectedIds);assert.equal(all.items.length,new Set(all.items.map(r=>r.id)).size);assert.ok(!JSON.stringify(all).includes('"explanation"'));assert.ok(!JSON.stringify(all).includes('"analysis_trace"'));checks.push('D1 identities, deduplication, list contains no explanations or analysis traces');
const facets=await api('/api/math-library/facets');assert.equal(facets.stats.total,expectedIds.size);assert.equal(facets.stats.classified,current.filter(q=>q.classification.knowledge_points.length).length);assert.equal(facets.stats.papers,new Set(current.map(r=>r.paperId)).size);assert.deepEqual(facets.stages,['高中']);checks.push('Scoped actual statistics and existing-stage facets');
// Every observed knowledge point/type/difficulty/source must match real linked data.
for(const [key,values,predicate] of [
 ['knowledge',facets.knowledge.map(k=>k.code),(r,v)=>r.classification.knowledge_points.some(k=>k.code===v)],
 ['type',facets.types,(r,v)=>r.classification.question_type===v],
 ['difficulty',facets.difficulties,(r,v)=>r.classification.difficulty===v],
 ['paper',facets.papers.map(p=>p.id),(r,v)=>r.paperId===v],
 ['chapter',facets.chapters.map(c=>c.code),(r,v)=>r.classification.chapter.code===v]
]){for(const value of values){const result=await api('/api/math-library?'+new URLSearchParams({[key]:value,pageSize:'50'}));assert.deepEqual(result.items.map(q=>q.id).sort(),current.filter(r=>predicate(r,value)).map(r=>r.id).sort(),key+':'+value);}checks.push('All actual '+key+' values match D1');}
const real=current.find(r=>!r.title.includes('验证')&&r.classification.difficulty==='中等');assert.ok(real,'Need an actual paper question');
const params=new URLSearchParams({q:'函数',stage:'高中',knowledge:real.classification.knowledge_points[0].code,difficulty:real.classification.difficulty,type:real.classification.question_type,paper:real.paperId});
const combined=await api('/api/math-library?'+params);assert.ok(combined.items.some(r=>r.id===real.id));assert.ok(combined.items.every(r=>r.text.includes('函数')));checks.push('Chinese keyword + stage + knowledge + type + difficulty + actual source combined');
const empty=await api('/api/math-library?q='+encodeURIComponent('完全不存在的检索词XYZ'));assert.equal(empty.total,0);checks.push('Empty query results');
const twoWords=await api('/api/math-library?q='+encodeURIComponent('函数 取值'));const expected=current.filter(r=>['函数','取值'].every(w=>r.original_text.includes(w)||JSON.stringify(r.classification).includes(w)));assert.deepEqual(twoWords.items.map(r=>r.id).sort(),expected.map(r=>r.id).sort());checks.push('AND Chinese keywords');
const literal=await api('/api/math-library?q='+encodeURIComponent("%' OR 1=1 --"));assert.equal(literal.total,0);await api('/api/math-library?page=0',400);await api('/api/math-library?pageSize=500',400);checks.push('Literal wildcards/injection and pagination validation');
let pageIds=[];for(let page=1;page<=Math.ceil(all.total/3);page++){const r=await api('/api/math-library?pageSize=3&page='+page);pageIds.push(...r.items.map(q=>q.id));}assert.equal(pageIds.length,expectedIds.size);assert.equal(new Set(pageIds).size,pageIds.length);assert.deepEqual(new Set(pageIds),expectedIds);checks.push('Four server pages contain each actual identity exactly once');
const detail=await api('/api/math-library/'+real.id);assert.equal(detail.text,real.original_text);assert.ok(detail.sources.length);for(const source of detail.sources){assert.ok(source.locator.regions.length);assert.ok(source.explanation);assert.ok(source.imageUrl);const img=await api(source.imageUrl);assert.ok(img.headers.get('content-type')?.startsWith('image/'));assert.ok((await img.arrayBuffer()).byteLength>0);}checks.push('Real full detail, regions, saved explanation, original R2 image');
for(const row of all.items){const detail=await api('/api/math-library/'+row.id);assert.equal(detail.id,row.id);if(row.imageUrl){const image=await api(row.imageUrl);assert.ok(image.headers.get('content-type')?.startsWith('image/'));await image.arrayBuffer();}}checks.push('All 10 current details and images load');
await api('/api/math-library',401,false);await api('/api/math-library/facets',401,false);await api('/api/math-library/'+real.id,401,false);await api(detail.sources[0].imageUrl,401,false);
await api('/api/math-library?scope=not-owned',403);await api('/api/math-library/facets?scope=not-owned',403);await api('/api/math-library/'+real.id+'?scope=not-owned',403);await api(detail.sources[0].imageUrl+'?scope=not-owned',403);checks.push('Unauthenticated and unauthorized scope blocked in list, stats, detail and image');
await api('/api/math-library/00000000-0000-4000-8000-000000000000',404);await api('/api/math-library/'+real.id+'/image/00000000-0000-4000-8000-000000000000',404);checks.push('Missing identity and image occurrence 404');
const spoof=await fetch(origin+'/api/math-library',{headers:{'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'}});assert.equal(spoof.status,401);checks.push('Forged client auth headers stripped');
for(const path of ['/math-library','/questions','/papers','/upload']){const r=await api(path);assert.equal(r.status,200);await r.text();}await api('/api/questions');await api('/api/papers');checks.push('Actual library HTML, existing student library, papers, upload and APIs still open');
assert.deepEqual(snapshot(),before);checks.push('Database content and all R2 blobs unchanged');
const paperCounts=db.prepare(`SELECT p.title,count(*) total,count(l.id) linked FROM paper_questions q JOIN papers p ON p.id=q.paper_id LEFT JOIN question_module_links l ON l.module_type='paper_question' AND l.module_record_id=q.id GROUP BY p.id`).all();
const multiple=db.prepare('SELECT canonical_question_id,count(*) n FROM question_occurrences GROUP BY canonical_question_id HAVING count(*)>1').all();
const report={at:new Date().toISOString(),origin,canonicalTotal:all.total,facets:facets.stats,checks,realCombinedExample:{id:real.id,query:params.toString()},papers:paperCounts,multiSourceActualSamples:multiple.length,limitations:['Only 10 Canonical identities currently exist; two come from a saved validation paper.','No actual multi-source Canonical exists; SQL guarantees one base row per identity, but a real multi-source end-to-end sample is unavailable.','No production identity provider or remote deployment was tested.'],databaseAndR2Unchanged:true};
mkdirSync(resolve(root,'../outputs'),{recursive:true});writeFileSync(resolve(root,'../outputs/阶段4A-真实验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));db.close();
