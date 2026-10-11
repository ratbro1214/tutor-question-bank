import { getBucket } from '@/lib/storage';
import { z } from 'zod';
import { getD1Binding } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { libraryScopes, LibraryError } from '@/lib/math-library-server';
import { privateScope } from '@/lib/paper-batch-server';
import { StudentCanonicalStore, StudentImportError } from '@/lib/student-canonical-store';

const bodySchema = z.object({ studentId: z.number().int().positive(), snapshot: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().min(1).max(20000), confirmed: z.literal(true) }).strict();
async function store(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new LibraryError('请先登录。', 401);
  const scopes = await libraryScopes(request), db = getD1Binding(), scope = await privateScope(db);
  if (!scopes.includes(scope.id)) throw new LibraryError('仅项目私有题库所有者可转入旧学生题。', 403);
  return new StudentCanonicalStore(db, getBucket(), scope.id, user.userId);
}
const response = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof StudentImportError || error instanceof LibraryError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof z.ZodError) return Response.json({ error: '请完整核对题目并勾选确认。' }, { status: 400 });
  console.error('[student-canonical] operation failed');
  return Response.json({ error: '统一题库入库失败，请稍后重试。' }, { status: 500 });
}
const idSchema = z.coerce.number().int().positive();
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const s = await store(request); return response(await s.preview(idSchema.parse((await context.params).id), idSchema.parse(new URL(request.url).searchParams.get('studentId')))); } catch (e) { return failure(e); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const origin = request.headers.get('Origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new LibraryError('不允许跨站修改题库。', 403);
    const s = await store(request), raw = await request.text();
    if (raw.length > 100000) throw new StudentImportError('请求内容过大。', 413);
    let data; try { data = JSON.parse(raw); } catch { throw new StudentImportError('请求内容无效。', 400); }
    const input = bodySchema.parse(data);
    return response(await s.add(idSchema.parse((await context.params).id), input.studentId, input.snapshot, input.text));
  } catch (e) { return failure(e); }
}
