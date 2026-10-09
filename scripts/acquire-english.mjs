import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const archive = path.resolve(root, '../outputs/english-exams');
const report = await readFile('E:/Google download/deep-research-report (1).md', 'utf8');
const rows = report.split('\n').filter(line => /^\| 202[0-5] \|/.test(line));
const papers = [];
const failures = [];
const decode = s => s.replaceAll('&amp;', '&');
for (const row of rows) {
  const [, year, volume] = row.match(/gaokao_en_(\d{4})_(II|I)/);
  const id = `gaokao_en_${year}_${volume}`;
  const urls = [...row.matchAll(/\]\((https:\/\/gaokao\.eol\.cn\/[^)]+)\)/g)].map(m => m[1]);
  const paper = { id, year: Number(year), volume, title: `${year}年${Number(year) >= 2023 ? '新课标' : '新高考'}全国${volume === 'I' ? 'Ⅰ' : 'Ⅱ'}卷英语`, status: 'PENDING', listeningIncluded: false, artifacts: [] };
  await mkdir(path.join(archive, 'raw', id), { recursive: true });
  const queue = [...urls];
  for (const url of queue) {
    try {
      const res = await fetch(url); if (!res.ok) throw Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const html = bytes.toString('utf8');
      const body = html.match(/<div[^>]*class=["']?TRS_Editor[^>]*>([\s\S]*?)<div class="perpage"/i)?.[1] || html.match(/<div[^>]*class=["']?TRS_Editor[^>]*>([\s\S]*?)<\/div>/i)?.[1];
      if (!body) throw Error('article body absent');
      if (urls.includes(url)) {
        const count = Number(html.match(/_PAGE_COUNT\s*=\s*"(\d+)"/)?.[1] || 1);
        for (let n = 1; n < count; n++) queue.push(url.replace(/\.shtml$/, `_${n}.shtml`));
      }
      async function save(data, sourceUrl, kind, ext, mime) {
        const sha256 = createHash('sha256').update(data).digest('hex');
        const filename = `${id}__${kind}__${sha256.slice(0,12)}${ext}`;
        const rawPath = path.join(archive, 'raw', id, filename);
        await writeFile(rawPath, data);
        let publicPath = null;
        if (kind !== 'html_snapshot') {
          const dest = path.join(root, 'public/english-exams', id, filename);
          await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, data);
          publicPath = `/english-exams/${id}/${filename}`;
        }
        const artifact = { id: `${id}_${sha256.slice(0,16)}`, kind, sourceUrl, sourcePage: url, sourceName: '中国教育在线', sourceTier: year === '2020' && volume === 'I' ? 'A' : 'A-', sha256, filename, rawPath, publicPath, mime, bytes: data.length, capturedAt: new Date().toISOString(), license: null };
        if (!paper.artifacts.some(a => a.id === artifact.id)) paper.artifacts.push(artifact);
      }
      await save(bytes, url, 'html_snapshot', '.html', 'text/html');
      const assets = [...body.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi), ...html.matchAll(/href\s*=\s*["']([^"']+\.docx?)["']/gi)].map(m => new URL(decode(m[1]), url).href).filter(u => /\.(?:png|jpe?g|gif|pdf|docx?)(?:\?|$)/i.test(u));
      for (const assetUrl of [...new Set(assets)]) {
        const a = await fetch(assetUrl); if (!a.ok) throw Error(`asset HTTP ${a.status}: ${assetUrl}`);
        const data = Buffer.from(await a.arrayBuffer());
        const ext = path.extname(new URL(assetUrl).pathname).toLowerCase();
        const kind = urls.length > 1 && (url === urls[1] || url.startsWith(urls[1].replace('.shtml','_'))) ? 'answer' : 'paper';
        if (data.length < 1000 || (a.headers.get('content-type') || '').includes('text/html')) throw Error(`invalid asset ${assetUrl}`);
        await save(data, assetUrl, kind, ext, a.headers.get('content-type'));
      }
    } catch(e) { failures.push({ id, url, error: String(e) }); }
  }
  papers.push(paper);
  console.log(id, paper.artifacts.map(a => `${a.kind}:${a.bytes}`).join(', '));
}
await mkdir(path.join(root, 'data/english'), { recursive: true });
await writeFile(path.join(root, 'data/english/manifest.json'), JSON.stringify({ papers, failures }, null, 2));
await writeFile(path.join(archive, 'manifest.json'), JSON.stringify({ papers, failures }, null, 2));
console.log('Failures:', JSON.stringify(failures));
