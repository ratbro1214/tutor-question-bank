import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { capturePaperReviewState } from './preview-paper-canonical-mapping.mjs';
import { buildPaperCanonicalReview } from '../lib/paper-canonical-review.mjs';
import { selectReviewRepresentatives, createPendingIdentityDecision, renderReviewPackageMarkdown, REQUIRED_CROSS_PAGE_IDS } from '../lib/paper-identity-review-package.mjs';
import { validateCanonicalIdentityDecision, DECISION_VERSION, COMPLETENESS_FIELDS } from '../lib/canonical-identity-decision.mjs';

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname,'..');
const output = path.resolve(root,'../outputs');
const assetName = '阶段2E-3-review-artifacts';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const runtime = 'C:/Users/asus/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const python = process.env.CANONICAL_REVIEW_PYTHON || path.join(runtime,'python/python.exe');
const poppler = process.env.CANONICAL_REVIEW_PDFTOPPM || path.join(runtime,'native/poppler/Library/bin/pdftoppm.exe');
const childOptions = {windowsHide:true,timeout:60000,maxBuffer:2*1024*1024};

export async function preparePaperIdentityReviewPackage() {
  // Fixed artifact output path; refuse links or existing deliveries rather than overwrite.
  let cursor=path.parse(output).root;
  for(const segment of output.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,segment);
    const stat=await fs.lstat(cursor).catch(e=>{if(e.code==='ENOENT') return null;throw e;});
    if(stat?.isSymbolicLink()) throw Error('Linked artifact paths are not allowed');
  }
  const names=['阶段2E-3-canonical-identity-decisions.json','阶段2E-3-canonical-review-materials.json','阶段2E-3-canonical-review-checklist.md',assetName];
  for(const name of names) if(await fs.lstat(path.join(output,name)).then(()=>true,e=>{if(e.code==='ENOENT') return false;throw e;})) throw Error('Artifact already exists; preserve it before an explicit rerun: '+name);
  const before=await capturePaperReviewState(root);
  const objectReferences=before.objects.map(object=>{
    const paths=Object.keys(before.files.r2_objects_mapping_and_wal).filter(file=>file.endsWith('/blobs/'+object.blob_id));
    return {...object,local_file:paths.length===1?path.resolve(root,paths[0]):null,blob_exists:paths.length>0,blob_path_count:paths.length};
  });
  const review=buildPaperCanonicalReview(before.papers,before.questions,{objectKeys:before.objects.map(o=>o.key),objectReferences});
  const selected=selectReviewRepresentatives(review.items);
  assert.equal(selected.length,10);
  const questions=new Map(before.questions.map(q=>[String(q.id),q]));
  const copiedSources=new Map(),pages=new Map(),writtenFiles=[];
  await fs.mkdir(output,{recursive:true});
  await fs.mkdir(path.join(output,assetName));
  for(const sub of ['sources','current','pages','regions']) await fs.mkdir(path.join(output,assetName,sub));
  const writeArtifact = async (relative,bytes) => {
    const destination=path.join(output,relative);
    await fs.writeFile(destination,bytes,{flag:'wx'});writtenFiles.push(relative);
    return {path:relative.split(path.sep).join('/'),sha256:digest(bytes),size:bytes.length};
  };
  const readObject = async key => {
    const refs=objectReferences.filter(ref=>ref.key===key);
    if(refs.length!==1 || !refs[0].local_file) throw Error('Missing/ambiguous local R2 blob: '+key);
    const bytes=await fs.readFile(refs[0].local_file);
    assert.equal(bytes.length,refs[0].size,'R2 object size differs from mapping');
    assert.equal(digest(bytes),before.files.r2_objects_mapping_and_wal[path.relative(root,refs[0].local_file).split(path.sep).join('/')]);
    return bytes;
  };
  const extension = bytes => {
    if(bytes.subarray(0,5).toString()==='%PDF-') return '.pdf';
    if(bytes[0]===0xff && bytes[1]===0xd8) return '.jpg';
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
    throw Error('Unsupported source/image signature');
  };
  const items=[];
  for(const item of selected) {
    assert.match(item.paper_question_id,/^[a-zA-Z0-9-]+$/);assert.match(item.paper_id,/^[a-zA-Z0-9-]+$/);
    const imageBytes=await readObject(item.image_file_reference.storage_key);
    const currentImage=await writeArtifact(`${assetName}/current/${item.paper_question_id}${extension(imageBytes)}`,imageBytes);
    if(!copiedSources.has(item.paper_id)) {
      const bytes=await readObject(item.source_file_reference.storage_key);
      const source=await writeArtifact(`${assetName}/sources/${item.paper_id}${extension(bytes)}`,bytes);
      source.matches_stored_file_hash=source.sha256===item.source_file_reference.file_hash;
      copiedSources.set(item.paper_id,source);
    }
    const source=copiedSources.get(item.paper_id),regionPreviews=[];
    const ordered=item.regions.map((metadata,index)=>({metadata,original_region_index:index,page:metadata.page})).sort((a,b)=>a.page-b.page || a.original_region_index-b.original_region_index);
    for(const fragment of ordered) {
      const pageKey=`${item.paper_id}:${fragment.page}`;
      let pagePreview=pages.get(pageKey);
      try {
        if(!pagePreview) {
          if(source.path.endsWith('.pdf')) {
            const prefix=`${assetName}/pages/${item.paper_id}-page-${fragment.page}`;
            await execute(poppler,['-f',String(fragment.page),'-l',String(fragment.page),'-r','144','-singlefile','-png',path.join(output,source.path),path.join(output,prefix)],childOptions);
            pagePreview=prefix+'.png';writtenFiles.push(pagePreview);
          } else {
            if(fragment.page!==1) throw Error('Raster source has only page 1');
            pagePreview=source.path;
          }
          pages.set(pageKey,pagePreview);
        }
        const cropPath=`${assetName}/regions/${item.paper_question_id}-page-${fragment.page}-region-${fragment.original_region_index+1}.png`;
        const {stdout}=await execute(python,[path.join(root,'scripts/crop-review-region.py'),path.join(output,pagePreview),JSON.stringify(fragment.metadata),path.join(output,cropPath)],childOptions);
        writtenFiles.push(cropPath);
        regionPreviews.push({...fragment,path:cropPath,page_preview:pagePreview,...JSON.parse(stdout)});
      } catch(error) {
        regionPreviews.push({...fragment,path:null,page_preview:pagePreview || null,error:error.message});
      }
    }
    const q=questions.get(item.paper_question_id);let explanation=null;
    try{explanation=q.explanation?JSON.parse(q.explanation):null;}catch{ /* raw auxiliary text is preserved below */ }
    const decision=createPendingIdentityDecision(item);
    const validation=validateCanonicalIdentityDecision(decision);assert.equal(validation.valid,true,JSON.stringify(validation.errors));
    for(const field of COMPLETENESS_FIELDS) assert.equal(decision[field],'unknown');
    items.push({...item,explanation,explanation_raw:q.explanation ?? null,pending_decision:decision,artifacts:{current_image:currentImage,source_file:source,region_previews:regionPreviews}});
  }
  // Covers copying AND all renderer/crop child processes. No process/service remains running.
  const after=await capturePaperReviewState(root,before.database);
  assert.deepEqual(after,before,'Database/WAL, paper rows, table counts or R2 changed; package FAILED');
  const decisions={schema_version:DECISION_VERSION,stage:'2E-3',reviewed:false,decisions:items.map(i=>i.pending_decision)};
  const materials={stage:'2E-3',generated_at:new Date().toISOString(),reviewed:false,items,
    summary:{selected_count:items.length,mandatory_cross_page_count:items.filter(i=>REQUIRED_CROSS_PAGE_IDS.includes(i.paper_question_id)).length,
      region_count:items.reduce((sum,i)=>sum+i.region_count,0),region_previews_created:items.flatMap(i=>i.artifacts.region_previews).filter(r=>r.path).length,
      region_preview_failures:items.flatMap(i=>i.artifacts.region_previews).filter(r=>!r.path),
      reference_anomalies:items.filter(i=>i.reference_anomalies.length).map(i=>({id:i.paper_question_id,issues:i.reference_anomalies})),
      source_hash_mismatches:[...copiedSources.values()].filter(s=>!s.matches_stored_file_hash),
      short_region_observations:items.flatMap(i=>i.regions.map((region,index)=>({id:i.paper_question_id,page:region.page,original_region_index:index,height:region.height})).filter(r=>r.height<0.05))},
    verification:{decisions_valid:true,all_statuses_NEEDS_REVIEW:true,all_completeness_unknown:true,no_reviewer:true,all_reviewed_at_null:true,
      database_and_wal_unchanged:true,papers_and_paper_questions_unchanged:true,r2_unchanged:true,no_ai_calls:true,
      canonical_table_counts:Object.fromEntries(Object.entries(after.counts).filter(([name])=>['question_library_scopes','canonical_questions','canonical_question_revisions','source_documents','question_occurrences','question_module_links'].includes(name))),
      before:{files:before.files,table_counts:before.counts,r2_object_count:before.objects.length},after:{files:after.files,table_counts:after.counts,r2_object_count:after.objects.length}},
    rendering:{method:'pdftoppm 144 DPI + Pillow normalized coordinate crop; no OCR/AI',region_order:'page then original array index',blank_fragments_retained:true},
    artifact_files:writtenFiles};
  // Re-open exported/cropped files to verify every relative path and fingerprint is usable.
  for(const file of writtenFiles) assert.ok((await fs.stat(path.join(output,file))).size>0);
  await writeArtifact(names[0],Buffer.from(JSON.stringify(decisions,null,2)));
  await writeArtifact(names[1],Buffer.from(JSON.stringify(materials,null,2)));
  await writeArtifact(names[2],Buffer.from(renderReviewPackageMarkdown(materials)));
  return {summary:materials.summary,verification:materials.verification,selected:items.map(i=>({id:i.paper_question_id,paper:i.paper_title,number:i.question_number,reason:i.selection_reason})),files:names.map(n=>path.join(output,n))};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {const result=await preparePaperIdentityReviewPackage();console.log(JSON.stringify({...result,verification:{...result.verification,before:undefined,after:undefined}},null,2));}
  catch(error){console.error('Review package FAILED: '+error.message);process.exitCode=1;}
}
