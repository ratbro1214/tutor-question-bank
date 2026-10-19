/** Independently authored teaching notes, separate from reviewed bank questions. */
export type LessonSeed = readonly [explanation: string, question: string, answer: string, steps: readonly string[]];
export type KnowledgeLesson = {
  code: string; title: string; version: string; reviewStatus: 'draft';
  explanation: string[];
  examples: { focus: string; question: string; answer: string; steps: readonly string[] }[];
};
