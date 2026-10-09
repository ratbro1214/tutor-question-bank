export type LanguageType = 'CLOZE' | 'GRAMMAR_FILL';
export function normalizeFillAnswer(value: string) {
  return value.trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
}
export function compareFillAnswer(value: string, accepted: string[]) {
  const normalized = normalizeFillAnswer(value);
  const exact = accepted.some(answer => normalizeFillAnswer(answer) === normalized);
  const caseOnly = !exact && accepted.some(answer => normalizeFillAnswer(answer).toLowerCase() === normalized.toLowerCase());
  return { correct: exact, caseOnly };
}
export function blankContext(text: string, number: number) {
  const marker = `[[${number}]]`, at = text.indexOf(marker);
  if (at < 0) return '';
  return text.slice(Math.max(0, at - 140), Math.min(text.length, at + marker.length + 160));
}
