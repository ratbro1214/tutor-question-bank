import { replayScenarios } from "@/lib/evaluation-scenarios";
import { evaluatePolicies } from "@/lib/teaching-evaluation";
export async function GET() {
  return new Response(JSON.stringify(evaluatePolicies(replayScenarios), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="teaching-evaluation.json"', "Cache-Control": "no-store" },
  });
}
