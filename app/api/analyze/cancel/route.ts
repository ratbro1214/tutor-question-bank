import { cancelAnalysis } from "@/lib/analysis-cancellation";

export async function POST(request: Request) {
  const body = await request.json() as { analysisId?: unknown };
  if (typeof body.analysisId !== "string" || !body.analysisId) return Response.json({ error: "任务编号无效。" }, { status: 400 });
  return Response.json({ cancelled: cancelAnalysis(body.analysisId) });
}
