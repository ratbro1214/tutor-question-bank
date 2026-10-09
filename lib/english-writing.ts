export type WritingType = 'APPLICATION' | 'CONTINUATION';
export type WritingTask = {
  id: string; type: WritingType; label: string; title: string; score: number; wordCount: number;
  text?: string; instruction?: string; material?: string; requirements?: string; openingLines?: string[];
};
export type WritingSource = {
  artifactId: string; publicPath: string; mime: string; sourceUrl: string; sourcePage: string;
  sourceName: string; sha256: string; page: number;
};
export type WritingPaper = {
  paperId: string; year: number; volume: string; title: string; status: string;
  tasks: WritingTask[]; sources: WritingSource[];
};
export type WritingSummary = Omit<WritingPaper, 'sources' | 'tasks'> & { tasks: Pick<WritingTask, 'id' | 'type' | 'label' | 'title' | 'score' | 'wordCount'>[] };
