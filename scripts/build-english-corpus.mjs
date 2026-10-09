import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const archive = path.resolve(root, '../outputs/english-exams');
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
const sql = ['PRAGMA foreign_keys=ON;'];
const quote = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
function insert(table, values) { sql.push(`INSERT OR IGNORE INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.values(values).map(quote).join(',')});`); }
const summaries = [];
for (const paper of manifest.papers) {
  insert('english_papers', { id: paper.id, year: paper.year, volume: paper.volume, title: paper.title, status: 'PENDING', listening_included: 0 });
  for (const a of paper.artifacts) insert('english_artifacts', { id: a.id, paper_id: paper.id, kind: a.kind, source_url: a.sourceUrl, source_page: a.sourcePage, source_name: a.sourceName, source_tier: a.sourceTier, sha256: a.sha256, filename: a.filename, public_path: a.publicPath, mime: a.mime, bytes: a.bytes, captured_at: a.capturedAt, license: a.license });
  const doc = paper.artifacts.find(a => /\.docx?$/.test(a.filename));
  const canonical = { paperId: paper.id, status: 'PENDING', extractionMethod: doc ? 'mineru-office-flash' : null, sections: [], passages: [], questions: [], options: [] };
  if (doc) {
    const inputPath = path.resolve(root, `../work/${paper.year}-${paper.volume}.md`);
    const raw = await readFile(inputPath, 'utf8');
    const headings = [...raw.matchAll(/^\*{0,2}第[一二三四]部分\s*(?:阅读|读?都分|语言运用|写作)[^\n]*/gm)];
    // A supplied DOCX has a typo “第二都分”; preserve that text, but recognize its heading.
    const typo = [...raw.matchAll(/^\*{0,2}第二都分\s*阅读[^\n]*/gm)];
    headings.push(...typo); headings.sort((a,b) => a.index - b.index);
    const first = new Map();
    for (const h of headings) { const type = h[0].includes('语言运用') ? 'language' : h[0].includes('写作') ? 'writing' : 'reading'; if (!first.has(type)) first.set(type, h); }
    const ordered = [...first].sort((a,b) => a[1].index-b[1].index);
    const stop = raw.search(/(?:参考答案|答案解析|试题答案|\*\*第二部分 阅读\*\*)/);
    for (let i = 0; i < ordered.length; i++) {
      const [type,h] = ordered[i];
      let end = ordered[i+1]?.[1].index ?? raw.length;
      if (stop > h.index && stop < end) end = stop;
      const text = raw.slice(h.index, end).trim();
      const section = { id: `${paper.id}_${type}`, paper_id: paper.id, type, title: { reading: '阅读理解与七选五', language: '语言运用', writing: '写作' }[type], position: i };
      canonical.sections.push(section); insert('english_sections', section);
      const spans = type === 'reading' ? [...text.matchAll(/^\*{0,2}([ABCD])\*{0,2}\s*$/gm)] : [];
      if (spans.length === 3 && spans.map(m=>m[1]).join('') === 'BCD') {
        const instruction = text.match(/阅读下列短文[^\n]*\n/);
        if (instruction) spans.unshift({ 1: 'A', index: instruction.index + instruction[0].length });
      }
      const split = type === 'reading' ? text.search(/第\s*二\s*节/) : -1;
      const chunks = spans.length === 4 ? spans.map((m,j) => ({ label: m[1], text: text.slice(m.index, spans[j+1]?.index ?? (split > m.index ? split : text.length)).trim() })) : [{ label: '正文', text }];
      if (spans.length === 4 && split >= 0) chunks.push({ label: '七选五', text: text.slice(split).trim() });
      for (const chunk of chunks) {
        const firstQuestion = type === 'reading' && /^[ABCD]$/.test(chunk.label) ? chunk.text.search(/^\*{0,2}\d{1,2}\s*[.．]\s*/m) : -1;
        const p = { id: `${section.id}_${chunk.label}`, section_id: section.id, label: chunk.label, text: firstQuestion >= 0 ? chunk.text.slice(0, firstQuestion).trim() : chunk.text, artifact_id: doc.id, source_locator: `doc:${doc.sha256.slice(0,7)}/tier:flash/page:1`, status: 'PENDING' };
        canonical.passages.push(p); insert('english_passages', p);
        if (type !== 'reading' || !/^[ABCD]$/.test(chunk.label)) continue;
        const matches = [...chunk.text.matchAll(/^\*{0,2}(\d{1,2})\s*[.．]\s*(.+)/gm)];
        for (let k=0; k<matches.length; k++) {
          const m = matches[k], part = chunk.text.slice(m.index, matches[k+1]?.index ?? chunk.text.length);
          const optionMatches = [...part.matchAll(/(?:^|\s)([ABCD])(?:\s*[.．]\s*|[ \t]+)/g)];
          if (optionMatches.length !== 4 || optionMatches.map(o=>o[1]).join('') !== 'ABCD') continue;
          const q = { id: `${paper.id}_Q${m[1]}`, section_id: section.id, passage_id: p.id, number: Number(m[1]), type: 'MCQ', stem: part.slice(0, optionMatches[0].index).replace(/^\*{0,2}\d+[.．]\s*/, '').trim(), score: '2.5' };
          canonical.questions.push(q); insert('english_questions', q);
          optionMatches.forEach((o,j) => { const option = { question_id: q.id, label: o[1], text: part.slice(o.index+o[0].length, optionMatches[j+1]?.index ?? part.length).trim() }; canonical.options.push(option); insert('english_options', option); });
          insert('english_answers', { question_id: q.id, answer: null, status: 'PENDING', evidence_ids: '[]', verified_at: null });
        }
      }
    }
    if (canonical.sections.length !== 3) throw Error(`${paper.id}: expected 3 non-listening sections, found ${canonical.sections.length}`);
    if (canonical.questions.length !== 15) throw Error(`${paper.id}: expected 15 reading MCQs, found ${canonical.questions.length}`);
  }
  summaries.push({ id: paper.id, artifacts: paper.artifacts.length, sections: canonical.sections.length, passages: canonical.passages.length, questions: canonical.questions.length });
  await writeFile(`data/english/${paper.id}.json`, JSON.stringify(canonical, null, 2));
}
await mkdir(archive, { recursive: true });
await writeFile(path.join(archive, 'import.sql'), sql.join('\n'));
await writeFile(path.join(archive, 'import-summary.json'), JSON.stringify(summaries, null, 2));
console.log(JSON.stringify(summaries, null, 2));
