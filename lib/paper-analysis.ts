import type { Classification } from './classification';
import type { ExplanationContent } from './question-explanation';

export type PaperAnalysisMode = 'classify' | 'explain';
// Classification is a complete operation; only an explicit explain request may solve.
export async function processPaperAnalysis({ mode, classification, educationStage, classify, explain }: {
 mode: PaperAnalysisMode; classification: Classification | null; educationStage: string;
 classify: () => Promise<Classification>; explain: (classification: Classification) => Promise<ExplanationContent>;
}) {
 const result = classification?.education_stage === educationStage ? classification : await classify();
 if (mode === 'classify') return { classification: result, content: null };
 return { classification: result, content: await explain(result) };
}
