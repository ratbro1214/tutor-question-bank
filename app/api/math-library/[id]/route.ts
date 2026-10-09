import { libraryDetail, libraryFailure, libraryScopes } from '@/lib/math-library-server';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const scopes=await libraryScopes(request);return Response.json(await libraryDetail((await context.params).id,scopes),{headers:{'Cache-Control':'no-store'}});}catch(error){return libraryFailure(error);}}
