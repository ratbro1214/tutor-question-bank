import type { LessonContent } from './lesson-plan';
import type { LessonAIQuestion } from './lesson-generation';

export type LessonExportSnapshot = {
  planId: string; versionId: string; revision: number; status: string; content: LessonContent;
  questions: (LessonAIQuestion & { images: { id: string; url: string }[] })[];
};
export type ExportImage = { id: string; data: Uint8Array; width: number; height: number; type: 'png' | 'jpeg' };
export function exportFilename(snapshot: LessonExportSnapshot, audience: 'teacher' | 'student') {
  const title = snapshot.content.topic.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 70).replace(/[. ]+$/, '') || '教案';
  return `${title}-${audience === 'teacher' ? '教师版教案' : '学生版讲义'}-v${snapshot.revision}.docx`;
}
