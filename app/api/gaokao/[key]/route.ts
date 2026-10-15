import { gaokaoSaveStatements } from '@/lib/gaokao-save';
import { getD1Binding } from '@/db';
import { getBucket } from '@/lib/storage';
import { gaokaoPaper, digest } from '@/lib/gaokao-catalog';
import { libraryScopes } from '@/lib/math-library-server';
import { solutionStore, solutionFailure } from '@/lib/paper-solution-server';
import { SolutionError } from '@/lib/paper-solution-store';
import { publicPaperQuestion, type PaperQuestionRow } from '@/lib/paper-server';
import { gaokaoEditSchema, gaokaoClassification } from '@/lib/gaokao-workbench';
import type { Classification } from '@/lib/classification';
import { explanationContentSchema } from '@/lib/question-explanation';

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const scopes = await libraryScopes(request), paper = gaokaoPaper((await context.params).key);
    if (!paper) throw new SolutionError('没有找到这份真题。', 404);
    const db = getD1Binding();
    const saved = await db.prepare(`SELECT p.id FROM papers p JOIN source_documents s ON s.math_paper_id=p.id WHERE p.file_hash=? AND s.scope_id IN (${scopes.map(() => '?').join(',')})`).bind(paper.pdfSha256, ...scopes).first<{ id: string }>();
    const rows = saved ? (await db.prepare('SELECT * FROM paper_questions WHERE paper_id=? ORDER BY question_number').bind(saved.id).all<PaperQuestionRow>()).results : [];
    const links = saved ? (await db.prepare("SELECT pq.id,c.id canonicalId,c.current_revision_id contentRevision FROM paper_questions pq JOIN question_module_links l ON l.module_type='paper_question' AND l.module_record_id=pq.id JOIN canonical_questions c ON c.id=l.canonical_question_id WHERE pq.paper_id=?").bind(saved.id).all<{ id: string; canonicalId: string; contentRevision: string }>()).results : [];
    return Response.json({ key: paper.key, title: paper.title, year: paper.year, volume: paper.volume, originalFilename: paper.originalFilename, sourceUrl: `/gaokao/papers/${paper.key}.pdf`, paperId: saved?.id || null, questions: paper.questions.map(q => { const row = rows.find(r => r.question_number === q.number), link = row && links.find(l => l.id === row.id); return { number: q.number, text: q.text, section: q.section, classification: q.classification, answer: q.answer, solution: q.solution, saved: row ? { ...publicPaperQuestion(row), canonicalId: link?.canonicalId || null, contentRevision: link?.contentRevision || null } : null }; }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return solutionFailure(e); }
}

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  let imageKey = '', committed = false;
  try {
    const store = await solutionStore(request, true), paper = gaokaoPaper((await context.params).key);
    if (!paper) throw new SolutionError('没有找到这份真题。', 404);
    const form = await request.formData();
    const parsed = gaokaoEditSchema.safeParse(JSON.parse(String(form.get('metadata'))));
    if (!parsed.success) throw new SolutionError('题号、分类或裁剪范围无效，请核对后重试。', 400);
    const input = parsed.data, sourceQuestion = paper.questions.find(q => q.number === input.number);
    if (!sourceQuestion) throw new SolutionError('该题号不在原卷中。', 400);
    const storedPaper = await store.paper(input.paperId);
    if (storedPaper.file_hash !== paper.pdfSha256) throw new SolutionError('原卷不匹配。', 400);
    const db = getD1Binding(), now = new Date().toISOString();
    const old = await db.prepare('SELECT * FROM paper_questions WHERE paper_id=? AND question_number=?').bind(input.paperId, input.number).first<PaperQuestionRow>();
    let classification;
    try { classification = gaokaoClassification(input, old?.classification ? JSON.parse(old.classification) as Classification : sourceQuestion.classification as Classification | null); } catch (e) { throw new SolutionError((e as Error).message, 400); }
    if ((old?.revision || 0) !== input.expectedRevision || old?.status === 'processing') throw new SolutionError('该题已更新或正在处理，请重新打开。', 409);
    const link = old ? await db.prepare("SELECT c.id,c.current_revision_id,r.revision FROM question_module_links l JOIN canonical_questions c ON c.id=l.canonical_question_id JOIN canonical_question_revisions r ON r.id=c.current_revision_id WHERE l.module_type='paper_question' AND l.module_record_id=? AND c.scope_id=?").bind(old.id, storedPaper.scopeId).first<{ id: string; current_revision_id: string; revision: number }>() : null;
    if ((link?.current_revision_id || null) !== input.expectedContentRevision) throw new SolutionError('题库版本已变化，请重新打开后保存。', 409);
    const image = form.get('image');
    let key = old?.image_key || '';
    if (image instanceof File) {
      if (!['image/jpeg', 'image/png'].includes(image.type) || !image.size || image.size > 8 * 1024 * 1024) throw new SolutionError('裁剪图片须为 8MB 以内的 JPG 或 PNG。', 400);
      const bytes = await image.arrayBuffer(), signature = new Uint8Array(bytes);
      if (!(image.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255 : signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10')) throw new SolutionError('图片内容无效。', 400);
      imageKey = `papers/${input.paperId}/questions/${crypto.randomUUID()}`; key = imageKey;
      await getBucket().put(key, bytes, { httpMetadata: { contentType: image.type } });
    }
    if (!key) throw new SolutionError('请先从原卷裁剪这道题。', 400);
    const source = await db.prepare('SELECT id FROM source_documents WHERE math_paper_id=? AND scope_id=?').bind(input.paperId, storedPaper.scopeId).first<{ id: string }>();
    if (!source) throw new SolutionError('原卷来源记录缺失。', 409);
    const referenceExplanation = input.text === sourceQuestion.text ? JSON.stringify(explanationContentSchema.parse({ status: 'ready', answer: sourceQuestion.answer || '具体结论见参考解析。', approach: '外部公开资料参考解答，尚未经教师核查。', steps: [{ title: '来源参考解析', content: sourceQuestion.solution || '来源未提供详细步骤。' }], teachingNotes: '', commonMistakes: '', verification: '请对照原卷核对题干、图形与结论。', alternativeMethod: '', missingInformation: '' })) : null;
    const { statements, canonical } = gaokaoSaveStatements(db, { input, old, link, source, key, imageKey, classification, owner: store.owner, scopeId: storedPaper.scopeId, now, hash: await digest(input.text), paperYear: paper.year, paperVolume: paper.volume, textSource: paper.textSource, pdfSource: paper.pdfSource, referenceExplanation });
    await db.batch(statements); committed = true;
    return Response.json({ ok: true, canonicalId: canonical });
  } catch (e) {
    if (e instanceof SyntaxError) return Response.json({ error: '保存数据无效。' }, { status: 400 });
    if (e instanceof Error && /UNIQUE constraint|FOREIGN KEY constraint/.test(e.message)) return Response.json({ error: '题目已被其他操作更新，请重新打开。' }, { status: 409 });
    return solutionFailure(e);
  } finally { if (imageKey && !committed) await getBucket().delete(imageKey).catch(() => {}); }
}
