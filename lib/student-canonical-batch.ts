import type { StudentPreview } from './student-canonical-store';

export type BatchImportResult = { questionId: number; status: 'added' | 'reused' | 'already' | 'failed'; canonicalId?: string; error?: string };
type Request = <T>(url: string, body?: unknown) => Promise<T>;

export async function importStudentQuestions(studentId: number, ids: number[], request: Request, progress: (done: number, total: number) => void, signal?: AbortSignal) {
  const unique = [...new Set(ids)], results: BatchImportResult[] = [];
  for (const questionId of unique) {
    if (signal?.aborted) break;
    try {
      const path = `/api/questions/${questionId}/canonical`;
      const preview = await request<StudentPreview>(`${path}?studentId=${studentId}`);
      if (signal?.aborted) break;
      if (preview.canonicalId) results.push({ questionId, status: 'already', canonicalId: preview.canonicalId });
      else {
        const saved = await request<{ canonicalId: string; reused: boolean }>(path, { studentId, snapshot: preview.snapshot, text: preview.text, confirmed: true });
        results.push({ questionId, status: saved.reused ? 'reused' : 'added', canonicalId: saved.canonicalId });
      }
    } catch (e) {
      if (signal?.aborted) break;
      results.push({ questionId, status: 'failed', error: e instanceof Error ? e.message : '加入失败，请重试。' });
    }
    progress(results.length, unique.length);
  }
  return results;
}
