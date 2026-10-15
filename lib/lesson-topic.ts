import { chaptersForStage, taxonomyForStage } from './taxonomy';
import type { LessonContent } from './lesson-plan';

// Suggestions come from the existing subject taxonomy; teachers can adjust them.
export function lessonTopicFilters(content: Pick<LessonContent, 'stage' | 'topic'>) {
  const normalize = (value: string) => value.replace(/[的与及和、\s]/g, '');
  const topic = normalize(content.topic);
  const chapters = chaptersForStage(content.stage).flatMap(([code,name]) => name.split(/[与及、]/).map(term=>({code,term:normalize(term)})))
    .filter(({term})=>term.length>=2&&topic.includes(term)).sort((a,b)=>b.term.length-a.term.length);
  const points = taxonomyForStage(content.stage).filter(([,name,chapter]) => chapter !== 'METHOD' && (!chapters.length || chapter === chapters[0].code) && normalize(name).length >= 2 && topic.includes(normalize(name)))
    .sort((a,b)=>b[1].length-a[1].length);
  if (points.length) return {stage:content.stage,chapter:points[0][2],knowledge:points[0][0]};
  return {stage:content.stage,chapter:chapters[0]?.code||'',knowledge:''};
}
