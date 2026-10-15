import { z } from 'zod';
import type { MethodContent } from './knowledge-graph';

export const METHOD_COMPLETION_PROMPT = 'method-thinking-v1';
const text = z.string().trim().min(1).max(3000);
export const methodCompletionSchema = z.object({ signals: z.array(text.max(500)).min(1).max(6), motivation: text }).strict();
export type MethodCompletion = z.infer<typeof methodCompletionSchema>;
export function missingThinking(content: MethodContent) {
  return { signals: !content.signals?.some(s => s.trim()), motivation: !content.motivation?.trim() };
}
export function fillMissingThinking(content: MethodContent, suggestion: MethodCompletion): MethodContent {
  const missing = missingThinking(content), valid = methodCompletionSchema.parse(suggestion);
  return { ...content, ...(missing.signals ? { signals: valid.signals } : {}), ...(missing.motivation ? { motivation: valid.motivation } : {}) };
}
