import { explanationContentSchema } from './question-explanation';

// Both legacy plain content and SavedExplanation envelopes exist in the library.
export function libraryExplanation(raw: unknown, reviewed: unknown, sourceText: string, sameRevision: boolean) {
  try {
    const saved = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    if (!sameRevision || !saved || (saved.content && saved.sourceText !== sourceText)) return { explanation: null, explanationReviewed: null };
    const result = explanationContentSchema.safeParse(saved.content || saved);
    if (!result.success) return { explanation: null, explanationReviewed: null };
    const review = saved.content ? saved.reviewed : reviewed;
    return { explanation: result.data, explanationReviewed: typeof review === 'boolean' ? review : review === 1 ? true : review === 0 ? false : null };
  } catch { return { explanation: null, explanationReviewed: null }; }
}
