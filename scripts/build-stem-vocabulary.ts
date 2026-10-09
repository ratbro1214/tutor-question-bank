import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractStemTerms, stemTerms, type StemExample } from '../lib/english-stem-vocabulary';

type CorpusPaper = { paperId: string; year: number; volume: string; title: string; passages: { label: string; artifactId: string; sourceLocators: string[]; questions: { id: string; number: number; type: string; stem: string }[] }[] };
const papers: CorpusPaper[] = JSON.parse(readFileSync('data/english/reading-practice.json', 'utf8'));
const examples: StemExample[] = papers.flatMap(p => p.passages.flatMap(t => t.questions
  .filter(q => q.type === 'MCQ' && q.stem.trim())
  .map(q => ({ paperId: p.paperId, year: p.year, volume: p.volume, title: p.title, passage: t.label,
    questionId: q.id, number: q.number, stem: q.stem, artifactId: t.artifactId,
    sourceLocators: t.sourceLocators, matches: extractStemTerms(q.stem) }))));
const terms = stemTerms.map(term => ({ ...term, questionCount: examples.filter(e => e.matches.some(m => m.id === term.id)).length }))
  .filter(term => term.questionCount > 0);
const data = { scope: '阅读理解 A–D 题干；不含选项、文章正文、听力及七选五占位符',
  sourceStatus: '源题干为现有自动提取文本，待逐题校对；释义与读题提示为教学整理。频次只代表本地语料。',
  dictionaryUrl: 'https://dictionary.cambridge.org/us/dictionary/english/suggest',
  paperCount: papers.length, questionCount: examples.length, matchedQuestionCount: examples.filter(e => e.matches.length).length, terms, examples };
writeFileSync('data/english/stem-vocabulary.json', JSON.stringify(data, null, 2) + '\n');
const output = resolve('../outputs/english-exams/stem-vocabulary');
mkdirSync(output, { recursive: true });
const csv = (rows: (string | number)[][]) => '\ufeff' + rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
writeFileSync(resolve(output, '题干关键词与真题出处.csv'), csv([
  ['词或短语', '题干义', '类别', '命中题数', '真题', '篇目', '题号', '原题干', '需上下文判断', '易错提醒', '读题方法', '题目ID', '原件ID'],
  ...terms.flatMap(t => examples.filter(e => e.matches.some(m => m.id === t.id)).map(e => [t.word, t.meaning, t.category, t.questionCount, e.title, e.passage, e.number, e.stem, e.matches.find(m => m.id === t.id)!.needsContext ? '是；两义均展示，不计作确定词义' : '否；按题干结构提示', t.confusion, t.strategy, e.questionId, e.artifactId])),
]));
const counts = new Map<string, { occurrences: number; questions: Set<string> }>();
for (const e of examples) for (const token of e.stem.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? []) {
  const item = counts.get(token) ?? { occurrences: 0, questions: new Set<string>() };
  item.occurrences++; item.questions.add(e.questionId); counts.set(token, item);
}
writeFileSync(resolve(output, '全部题干词形频次.csv'), csv([['词形（未归并）', '出现次数', '出现题数'], ...[...counts].sort((a, b) => b[1].questions.size - a[1].questions.size || a[0].localeCompare(b[0])).map(([word, count]) => [word, count.occurrences, count.questions.size])]));
writeFileSync(resolve(output, '题干词汇学习说明.md'), `# 真题题干词汇\n\n${data.scope}。${papers.length} 套卷，${examples.length} 道题，${terms.length} 条已命中的教学词条（同词不同义分别列出）。${data.sourceStatus}\n\n不在当前语料中出现的预设词不展示频次。suggest 题干无法单独判义时列出两义并标记需上下文判断，因此不同义项的题数不可相加。\n\n[词义参考：Cambridge suggest](${data.dictionaryUrl})。阅读试题保留现有来源编号，部分卷号从 1 开始；不能把编号统一换算为官方题号。\n\n` + terms.map(t => `## ${t.word} · ${t.meaning}\n\n${t.questionCount} 道题 · ${t.category}\n\n${t.confusion}\n\n读题方法：${t.strategy}\n\n` + examples.filter(e => e.matches.some(m => m.id === t.id)).slice(0, 3).map(e => `- ${e.title} · 阅读 ${e.passage} · 来源题号 ${e.number}：${e.stem}${e.matches.find(m => m.id === t.id)!.needsContext ? '（需结合原文判义）' : ''}`).join('\n')).join('\n\n'));
console.log(JSON.stringify({ papers: papers.length, questions: examples.length, terms: terms.length, matchedQuestions: data.matchedQuestionCount, output }));
