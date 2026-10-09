import {readFile,writeFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
const manifest=JSON.parse(await readFile('data/english/manifest.json','utf8'));
const data=JSON.parse(await readFile('data/english/reading-practice.json','utf8'));
if(data.length!==12)throw Error('All 12 papers must be extracted before importing');
const sql=['PRAGMA foreign_keys=ON;'];
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
function upsert(table,values,keys,condition=''){
 const cols=Object.keys(values),updates=cols.filter(c=>!keys.includes(c)).map(c=>`${c}=excluded.${c}`);
 sql.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${Object.values(values).map(quote).join(',')}) ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${updates.join(',')} ${condition};`);
}
for(const p of manifest.papers){
 upsert('english_papers',{id:p.id,year:p.year,volume:p.volume,title:p.title,status:'READING_READY',listening_included:0},['id']);
 for(const a of p.artifacts){
  if(p.id==='gaokao_en_2024_I'&&a.sourcePage.includes('2616032')&&a.kind==='paper')a.kind='answer';
  upsert('english_artifacts',{id:a.id,paper_id:p.id,kind:a.kind,source_url:a.sourceUrl,source_page:a.sourcePage,source_name:a.sourceName,source_tier:a.sourceTier,sha256:a.sha256,filename:a.filename,public_path:a.publicPath,mime:a.mime,bytes:a.bytes,captured_at:a.capturedAt,license:a.license},['id']);
 }
 const paper=data.find(d=>d.paperId===p.id),section=`${p.id}_reading`;
 upsert('english_sections',{id:section,paper_id:p.id,type:'reading',title:'阅读理解与七选五',position:0},['id']);
 for(const t of paper.passages){
  upsert('english_passages',{id:t.id,section_id:section,label:t.label,text:t.text,artifact_id:t.artifactId,source_locator:JSON.stringify(t.sourceLocators),status:'EXTRACTED'},['id']);
  if(t.figures?.length)upsert('english_annotations',{id:`${t.id}_figures`,passage_id:t.id,input_sha256:manifest.papers.find(p=>p.id===paper.paperId).artifacts.find(a=>a.id===t.artifactId).sha256,pipeline:'reading-figures',version:'1',payload:JSON.stringify(t.figures),generated_at:new Date().toISOString()},['id']);
  for(const q of t.questions){
   upsert('english_questions',{id:q.id,section_id:section,passage_id:t.id,number:q.number,type:q.type,stem:q.stem,score:'2.5'},['id']);
   for(const o of q.options)upsert('english_options',{question_id:q.id,label:o.label,text:o.text},['question_id','label']);
   const e=paper.evidence.find(e=>e.id===q.answerEvidenceId);
   upsert('english_answer_evidence',{id:e.id,question_id:q.id,artifact_id:e.artifactId,independence_group:new URL(e.sourceUrl).hostname,raw_answer:JSON.stringify({sourceNumber:e.sourceNumber,questionNumber:e.questionNumber,rawAnswer:e.rawAnswer}),normalized_answer:e.normalizedAnswer,method:e.method},['id']);
   upsert('english_answers',{question_id:q.id,answer:q.answer,status:'SOURCE_ALIGNED',evidence_ids:JSON.stringify([e.id]),verified_at:null},['question_id'],"WHERE english_answers.status!='VERIFIED'");
  }
 }
}
await writeFile('data/english/manifest.json',JSON.stringify(manifest,null,2));
await writeFile('../outputs/english-exams/manifest.json',JSON.stringify(manifest,null,2));
const file='../outputs/english-exams/reading/import-reading.sql';await writeFile(file,sql.join('\n'));
if(process.argv.includes('--apply')){
 const dir=path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');if(files.length!==1)throw Error('Expected one application database');
 const db=new DatabaseSync(path.join(dir,files[0]));db.exec('PRAGMA busy_timeout=10000;');
 const students=db.prepare('SELECT COUNT(*) n FROM students').get().n;
 try{db.exec('BEGIN IMMEDIATE;');db.exec(sql.join('\n'));db.exec('COMMIT;');}catch(e){db.exec('ROLLBACK;');throw e;}
 if(db.prepare('SELECT COUNT(*) n FROM students').get().n!==students)throw Error('Unexpected student count change');
 console.log('Imported 12 reading papers; existing student count preserved:',students);db.close();
}else console.log('Generated:',file);
