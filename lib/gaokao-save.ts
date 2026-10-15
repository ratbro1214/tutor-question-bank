import type { z } from 'zod';
import type { gaokaoEditSchema } from './gaokao-workbench';
import type { Classification } from './classification';
import type { PaperQuestionRow } from './paper-server';
export type GaokaoSave = {
 input: z.infer<typeof gaokaoEditSchema>; old: PaperQuestionRow | null;
 link: { id: string; current_revision_id: string; revision: number } | null;
 source: { id: string }; key: string; imageKey: string; classification: Classification;
 owner: string; scopeId: string; now: string; hash: string;
 paperYear: number; paperVolume: number; textSource: string; pdfSource: string;
 referenceExplanation?: string | null;
};
export function gaokaoSaveStatements(db: D1Database, context: GaokaoSave) {
 const { input,old,link,source,key,imageKey,classification,owner,scopeId,now,hash,paperYear,paperVolume,textSource,pdfSource } = context;
    const canonical = link?.id || crypto.randomUUID(), revision = crypto.randomUUID(), questionId = old?.id || crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    if (!link) statements.push(db.prepare("INSERT INTO canonical_questions(id,scope_id,subject,status,created_at,updated_at) VALUES(?,?,'math','active',?,?)").bind(canonical, scopeId, now, now));
    // A unique revision number makes concurrent saves fail atomically instead of overwriting.
    statements.push(db.prepare("INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,education_stage,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,supersedes_id,change_reason,created_by,created_at) SELECT ?,?,?,'math','高中',?,?,?,'gaokao-curated-v1','gaokao-source-v1',?,'ready',?,'教师核对裁剪与分类',?,? WHERE (? IS NULL AND NOT EXISTS(SELECT 1 FROM paper_questions WHERE paper_id=? AND question_number=?)) OR EXISTS(SELECT 1 FROM paper_questions WHERE id=? AND revision=? AND status<>'processing')").bind(revision, canonical, (link?.revision || 0) + 1, input.text, input.text, hash, JSON.stringify({ classification, reviewed: true, externalSource: { year: paperYear, volume: paperVolume, textSource: textSource, originalSource: pdfSource } }), link?.current_revision_id || null, owner, now, old?.id || null, input.paperId, input.number, old?.id || null, input.expectedRevision));
    statements.push(db.prepare("UPDATE canonical_questions SET current_revision_id=?,updated_at=? WHERE id=?").bind(revision, now, canonical));
    if (old) statements.push(db.prepare("UPDATE paper_questions SET image_key=?,regions=?,question_text=?,classification=?,revision=revision+1,status='ready',error=?,updated_at=? WHERE id=? AND revision=?").bind(key, JSON.stringify(input.regions), input.text, JSON.stringify(classification), imageKey ? '裁剪已更新，请核对已有参考解析。' : old.error, now, questionId, input.expectedRevision));
    else statements.push(db.prepare("INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,question_text,classification,explanation,model,revision,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,'ready',?)").bind(questionId, input.paperId, input.number, JSON.stringify(input.regions), key, input.text, JSON.stringify(classification), context.referenceExplanation || null, context.referenceExplanation ? 'external:Gaokao-Math-Problems-Compilation' : '', now));
    if (link) statements.push(db.prepare("UPDATE question_occurrences SET content_revision_id=?,image_key=?,source_locator_json=?,raw_text=?,page=?,mapping_status='confirmed',updated_at=? WHERE canonical_question_id=? AND source_document_id=? AND occurrence_key=?").bind(revision, key, JSON.stringify({ regions: input.regions }), input.text, input.regions[0].page, now, canonical, source.id, 'question:' + input.number));
    else {
      const occurrence = crypto.randomUUID();
      statements.push(db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,question_number,page,source_locator_json,image_key,raw_text,mapping_status) VALUES(?,?,?,?,'math_paper',?,?,?,?,?,?,'confirmed')").bind(occurrence, canonical, revision, source.id, 'question:' + input.number, String(input.number), input.regions[0].page, JSON.stringify({ regions: input.regions }), key, input.text));
      statements.push(db.prepare("INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_paper_question_id,observed_source_hash) VALUES(?,'paper_question',?,?,?,?,?)").bind(crypto.randomUUID(), questionId, canonical, occurrence, questionId, hash));
    }

    return { statements, canonical };
}
