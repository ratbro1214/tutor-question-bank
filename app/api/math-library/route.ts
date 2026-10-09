import { libraryFailure, libraryScopes, searchLibrary } from '@/lib/math-library-server';
export async function GET(request:Request){try{return Response.json(await searchLibrary(request,await libraryScopes(request)),{headers:{'Cache-Control':'no-store'}});}catch(error){return libraryFailure(error);}}
