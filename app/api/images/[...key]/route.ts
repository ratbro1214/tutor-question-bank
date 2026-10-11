import { getBucket } from "@/lib/storage";
import { solutionStore, solutionFailure } from '@/lib/paper-solution-server';

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const objectKey=key.join('/'),segments=objectKey.split('/');
  // Paired solution sources always require their owner/scope checked file endpoint.
  if (segments[0] === 'paper-solutions') return new Response('Not found', { status: 404 });
  if(segments[0]==='papers'){
    try{await (await solutionStore(_request)).paper(segments[1]);}catch(e){return solutionFailure(e);}
  }
  const object = await getBucket().get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}
