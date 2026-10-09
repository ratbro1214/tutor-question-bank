import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
const corrections = JSON.parse(await readFile('data/english/extraction-corrections.json', 'utf8'));
const output = path.resolve('../work/english-language');
await mkdir(output, { recursive: true });
function clean(text) {
 return text.replace(/<!--[^]*?-->/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
 .replace(/<table[^>]*>([^]*?)<\/table>/gi,(_,table)=>table.replace(/<tr[^>]*>([^]*?)<\/tr>/gi,(_,row)=>'\n| '+[...row.matchAll(/<t[dh][^>]*>([^]*?)<\/t[dh]>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' ').trim()).join(' | ')+' |\n'))
 .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
 .replace(/\\([_$])/g,'$1').replace(/\*\*/g,'').replace(/^#{1,6}\s*/gm,'').replace(/```(?:txt|text)?/g,'')
 .replace(/^\s*\d{1,2}\s*$/gm,'').replace(/^.*(?:英语试题第|英语试题参考答案第|页（共\d+页）|页\(共\d+页\)).*$/gm,'')
 .replace(/^第\d+页\s*[/／]\s*共\d+页\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
for (const p of manifest.papers) {
 const direct = p.artifacts.find(a => a.kind === 'paper' && /\.docx?$/.test(a.filename)) || (['gaokao_en_2021_I','gaokao_en_2024_I'].includes(p.id) ? p.artifacts.find(a => a.mime === 'application/pdf') : null);
 const artifacts = direct ? [direct] : p.artifacts.filter(a => a.kind === 'paper' && a.mime?.startsWith('image/'));
 let texts = [];
 for (const a of artifacts) texts.push(await readFile(direct ? `../work/${p.year}-${p.volume}.md` : `../work/english-reading/${a.id}.md`, 'utf8'));
 let text = texts.join('\n\n');
 for (const c of corrections.filter(c => c.paperId === p.id)) text = text.replace(c.ocr, c.transcription);
 text = clean(text);
 const start = text.search(/第[二三](?:部分|都分)\s*语言(?:运用)?/);
 if (start < 0) throw new Error(`${p.id}: language heading missing`);
 const rest = text.slice(start), end = rest.search(/第[三四]部分\s*写作/);
 const language = rest.slice(0, end < 0 ? undefined : end);
 const answers = [];
 if (direct) { const full = clean(texts[0]), i = full.search(/参考答案/); if (i >= 0) answers.push({ artifactId: direct.id, text: full.slice(i) }); }
 for (const a of p.artifacts.filter(a => a.kind === 'answer' || a.mime?.startsWith('image/'))) {
   try { const full = clean(await readFile(`../work/english-reading/${a.id}.md`, 'utf8')); if (a.kind === 'answer' || /参考答案|【答案】|其余题型答案/.test(full)) answers.push({ artifactId: a.id, text: full }); }
   catch (e) { if (e.code !== 'ENOENT') throw e; }
 }
 const result = { paperId: p.id, year: p.year, volume: p.volume, title: p.title, text: language,
   artifactId: artifacts[0].id, sourceLocators: artifacts.map(a => `doc:${a.sha256.slice(0,7)}/tier:${direct && direct.mime !== 'application/pdf' ? 'flash' : 'standard'}`), answers };
 await writeFile(path.join(output, `${p.id}.json`), JSON.stringify(result, null, 2));
 await writeFile(path.join(output, `${p.year}-${p.volume}.txt`), language);
 console.log(p.id, language.length, 'chars', answers.length, 'answer candidates');
}
