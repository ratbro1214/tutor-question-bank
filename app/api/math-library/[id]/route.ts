import { libraryDetail, libraryFailure, libraryScopes, libraryTrashStore } from '@/lib/math-library-server';
import { LibraryTrashError } from '@/lib/math-library-trash';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const scopes=await libraryScopes(request);return Response.json(await libraryDetail((await context.params).id,scopes),{headers:{'Cache-Control':'no-store'}});}catch(error){return libraryFailure(error);}}
function failure(error: unknown) { return error instanceof LibraryTrashError ? Response.json({ error: error.message }, { status: error.status }) : libraryFailure(error); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
 try { return Response.json(await (await libraryTrashStore(request)).change((await context.params).id)); } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try { return Response.json(await (await libraryTrashStore(request)).change((await context.params).id, true)); } catch (error) { return failure(error); }
}
