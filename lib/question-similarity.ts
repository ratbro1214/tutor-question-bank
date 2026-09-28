export type SimilarityQuestion = {
  id: number;
  chapterCode: string;
  chapterName: string;
  extractedQuestion: string;
  knowledgePointCodes: string[];
};

export type SimilarQuestionCandidate = Pick<SimilarityQuestion, "id" | "chapterName"> & {
  similarity: number;
};

function normalizeQuestion(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function grams(value: string) {
  const characters = Array.from(value);
  if (characters.length < 3) return new Set(characters.length ? [value] : []);
  return new Set(Array.from({ length: characters.length - 2 }, (_, index) => characters.slice(index, index + 3).join("")));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/** Returns review suggestions only; a high score never means the questions are identical. */
export function rankSimilarQuestions(
  question: Pick<SimilarityQuestion, "chapterCode" | "extractedQuestion" | "knowledgePointCodes">,
  existing: SimilarityQuestion[],
  limit = 5,
): SimilarQuestionCandidate[] {
  const normalized = normalizeQuestion(question.extractedQuestion);
  if (normalized.length < 10) return [];
  const questionGrams = grams(normalized);
  const pointCodes = new Set(question.knowledgePointCodes);

  return existing
    .flatMap((candidate) => {
      const candidateText = normalizeQuestion(candidate.extractedQuestion);
      if (candidateText.length < 10) return [];
      const textSimilarity = jaccard(questionGrams, grams(candidateText));
      const sameChapter = question.chapterCode === candidate.chapterCode;
      const sharedPoints = candidate.knowledgePointCodes.filter((code) => pointCodes.has(code)).length;
      const pointSimilarity = sharedPoints / Math.max(1, new Set([...candidate.knowledgePointCodes, ...pointCodes]).size);

      // Similar tags alone are too weak: require both a textual signal and taxonomy context.
      if (textSimilarity < 0.32 || (!sameChapter && sharedPoints === 0)) return [];
      const score = textSimilarity * 0.82 + (sameChapter ? 0.1 : 0) + pointSimilarity * 0.08;
      if (score < 0.38) return [];
      return [{ id: candidate.id, chapterName: candidate.chapterName, similarity: Math.round(score * 100) }];
    })
    .sort((left, right) => right.similarity - left.similarity || left.id - right.id)
    .slice(0, limit);
}
