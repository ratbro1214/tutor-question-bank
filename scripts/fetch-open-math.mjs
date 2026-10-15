// Fetch only pinned, licensed text/data files; never execute upstream code.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../data/open-math/sources/', import.meta.url);
const repos = [
  { id: 'mathmap-cn', repo: 'xmonkey/mathmap-cn', commit: '74f05d421c8d72de68d983dbdef160e55c0873e8', license: 'CC-BY-SA-4.0', files: ['LICENSE', 'NOTICE', 'README.md', ...['math-stage4-gg','math-stage4-na','math-stage4-sp-cp','math-stage5','math-supplement','math-supplement-fine','math-supplement-fine2'].map(n => `data/topics/${n}.json`), ...['math-stage4-gg-internal','math-stage4-na-internal','math-stage4-sp-cp-internal','math-stage5-internal','math-s4-s5-cross','math-cross-domain','math-na-cross','math-sp-cp-internal','math-supplement-deps','math-supplement-fine-deps','math-supplement-fine2-deps'].map(n => `data/dependencies/${n}.json`)] },
  { id: 'mathbook', repo: 'liuhaopeng543/MathBook', commit: '5b81b2d8cd2fc0fb5c6dee5e8c064f4416582aaf', license: 'MIT', files: ['LICENSE','README.md','01.方程求解.md','02.集合.md','03.不等式.md','04.函数.md','05.基本计算.md','06.三角恒等变换.md','07.平面向量.md','08.立体几何.md','09.空间向量.md','10.解析几何.md','11.数列.md','12.导数.md','13.统计.md','14.概率.md','15.组合计数.md'] },
];
const manifest = [];
if (process.argv.includes('--plan')) { process.stdout.write(JSON.stringify(repos)); process.exit(0); }
for (const repo of repos) {
  const records = [];
  for (const path of repo.files) {
    const url = `https://raw.githubusercontent.com/${repo.repo}/${repo.commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`${response.status}: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const target = new URL(`${repo.id}/${path}`, root);
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, bytes);
    records.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  manifest.push({ ...repo, files: records, url: `https://github.com/${repo.repo}`, fetchedOn: '2026-10-11' });
  process.stdout.write(`${repo.id}: ${records.length} files\n`);
}
await writeFile(new URL('../manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
