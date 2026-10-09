import { searchVocabulary } from '@/lib/english-study';
import { z } from 'zod';
export async function GET(request:Request) {
  return Response.json(searchVocabulary(new URL(request.url).searchParams));
}
export async function POST(request:Request) {
  try {
    const body=z.object({words:z.array(z.string().min(1).max(100)).max(10000)}).strict().safeParse(await request.json());
    if(!body.success)return Response.json({error:'复习词条格式错误'},{status:400});
    return Response.json(searchVocabulary(new URL(request.url).searchParams,body.data.words));
  } catch {return Response.json({error:'复习词条格式错误'},{status:400});}
}
