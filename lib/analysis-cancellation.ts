const shared = globalThis as typeof globalThis & { __tutorActiveAnalyses?: Map<string, AbortController> };
const activeAnalyses = shared.__tutorActiveAnalyses ??= new Map<string, AbortController>();

export function registerAnalysis(id: string, controller: AbortController) {
  activeAnalyses.set(id, controller);
}

export function cancelAnalysis(id: string) {
  const controller = activeAnalyses.get(id);
  if (!controller) return false;
  controller.abort();
  activeAnalyses.delete(id);
  return true;
}

export function unregisterAnalysis(id: string) {
  activeAnalyses.delete(id);
}
