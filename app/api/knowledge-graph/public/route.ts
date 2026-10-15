import { openMathCatalog } from '@/lib/open-math';
// Public, bundled reference content. No access to private question-bank data.
export async function GET() {
  return Response.json(openMathCatalog, { headers: { 'Cache-Control': 'no-cache' } });
}
