// Shared source resolution for current and pinned Canonical revisions.
export const librarySourcesSql = `SELECT o.id,o.question_number,o.page,o.source_locator_json,o.image_key,o.public_image_path,o.content_revision_id,o.mapping_status,s.title,s.math_paper_id,s.source_type,s.source_url,s.license,s.metadata,
 l.module_type,l.module_record_id,
 CASE WHEN pq.question_text=? THEN pq.explanation WHEN sq.extracted_question=? AND sq.deleted_at IS NULL AND qe.source_text=sq.extracted_question THEN qe.content END AS explanation,
 CASE WHEN sq.extracted_question=qe.source_text AND sq.deleted_at IS NULL THEN qe.reviewed END AS explanation_reviewed,
 CASE WHEN pq.id IS NOT NULL THEN pq.question_text=? WHEN sq.id IS NOT NULL THEN sq.extracted_question=? ELSE NULL END AS business_content_matches
 FROM question_occurrences o JOIN source_documents s ON s.id=o.source_document_id AND s.scope_id=?
 LEFT JOIN question_module_links l ON l.id=(SELECT l2.id FROM question_module_links l2 WHERE l2.occurrence_id=o.id AND l2.canonical_question_id=o.canonical_question_id ORDER BY l2.created_at DESC,l2.id LIMIT 1)
 LEFT JOIN paper_questions pq ON l.module_type='paper_question' AND pq.id=l.module_record_id
 LEFT JOIN questions sq ON l.module_type='student_question' AND CAST(sq.id AS TEXT)=l.module_record_id
 LEFT JOIN question_explanations qe ON qe.question_id=sq.id
 WHERE o.canonical_question_id=? AND o.mapping_status!='detached' ORDER BY o.created_at,o.id`;
