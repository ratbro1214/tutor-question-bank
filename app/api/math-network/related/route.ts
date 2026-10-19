import { projectNetworkMapping, normalizeNetworkLabel } from '@/lib/math-network-mapping';
import { catalogStore } from '@/lib/knowledge_graph/server';
import { libraryScopes, searchLibrary, libraryFailure } from '@/lib/math-library-server';
import { getD1Binding } from '@/db';
import { libraryBase, libraryProjection } from '@/lib/math-library-query';

export async function GET(request: Request) {
 try {
  const scopes = await libraryScopes(request);
  const id = new URL(request.url).searchParams.get('node') || '';
  if (id.length > 200) return Response.json({error:'节点参数无效。'}, {status:400});
  const mapping = projectNetworkMapping(id);
  if (!mapping) return Response.json({mapping:null, catalogNodes:[], groups:[], notice:'该节点暂无明确的项目知识点映射。'}, {headers:{'Cache-Control':'no-store'}});
  const groups: {basis:string;code:string;name:string;total:number;items:unknown[]}[] = [];
  for (const kp of mapping.knowledgeCodes) {
   const url = new URL(request.url); url.search = new URLSearchParams({knowledge:kp.code,stage:'高中',pageSize:'6'}).toString();
   const result = await searchLibrary(new Request(url, {headers:request.headers}), scopes);
   groups.push({basis:kp.basis,code:kp.code,name:kp.name,total:result.total,items:result.items});
  }
  let catalogNodes: {id:string;name:string;knowledge_review_status:string}[] = [];
  let catalogUnavailable = false;
  try {
   const catalog = await (await catalogStore(request)).list(true);
   catalogNodes = catalog.nodes.filter(n => mapping.catalogNodes.some(m => m.id === n.id && normalizeNetworkLabel(m.name) === normalizeNetworkLabel(n.name)))
    .map(n => ({id:n.id,name:n.name,knowledge_review_status:n.knowledge_review_status}));
   const approved = catalogNodes.filter(n => n.knowledge_review_status === 'approved');
   if (approved.length) {
    const rows = await getD1Binding().prepare(libraryBase(scopes) + `SELECT ${libraryProjection},count(*) OVER() AS match_total FROM library c WHERE EXISTS (
     SELECT 1 FROM question_knowledge_relation qkr JOIN knowledge_relation_evidence e ON e.question_id=qkr.question_id AND e.knowledge_id=qkr.knowledge_id
     WHERE qkr.question_id=c.id AND qkr.scope_id=c.scope_id AND qkr.knowledge_id IN (${approved.map(()=>'?').join(',')})
     AND qkr.knowledge_review_status='approved' AND e.revision_id=c.current_revision_id) ORDER BY c.id LIMIT 6`).bind(...scopes,...approved.map(n=>n.id)).all();
    if (rows.results.length) groups.push({basis:'approved_catalog_links',code:'',name:'已审核知识挂载',total:Number(rows.results[0].match_total),items:rows.results});
   }
  } catch { catalogUnavailable = true; }
  const chapterGroups = [];
  for (const chapter of mapping.chapters) {
   const url = new URL(request.url);url.search = new URLSearchParams({chapter:chapter.code,stage:'高中',pageSize:'3'}).toString();
   const result = await searchLibrary(new Request(url,{headers:request.headers}),scopes);
   chapterGroups.push({code:chapter.code,name:chapter.name,total:result.total,items:result.items});
  }
  return Response.json({mapping,catalogNodes,catalogUnavailable,groups,chapterGroups,notice:'分类匹配仅供选题，不表示题目解法已审核；同章节拓展不算知识点匹配。'}, {headers:{'Cache-Control':'no-store'}});
 } catch(error) { return libraryFailure(error); }
}
