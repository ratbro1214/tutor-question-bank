import { getD1Binding } from '@/db';

export async function GET() {
  try {
    const db = getD1Binding();
    const papers = await db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM english_artifacts a WHERE a.paper_id=p.id AND a.kind!='html_snapshot') AS artifact_count, (SELECT COUNT(*) FROM english_sections s WHERE s.paper_id=p.id) AS section_count FROM english_papers p ORDER BY year DESC, volume`).all();
    return Response.json({ papers: papers.results });
  } catch (error) {
    console.error('English corpus read failed', error);
    return Response.json({ error: '真题库读取失败，请检查数据库迁移与导入是否完成。' }, { status: 500 });
  }
}
