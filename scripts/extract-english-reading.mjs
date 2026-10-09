import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const manifest = JSON.parse(await readFile('data/english/manifest.json','utf8'));
const work = path.resolve('../work/english-reading');
await mkdir(work,{recursive:true});
const tasks = [];
for (const p of manifest.papers) {
  const images = p.artifacts.filter(a=>a.mime?.startsWith('image/'));
  // Reuse the five Word extractions. Their answer sheets are archived separately.
  const selected = process.argv.includes('--supplements') ? images.filter(a=> /2227908|2230990|2258743|2435473|2435470|2674288/.test(a.sourcePage)) : p.year <= 2022 ? images.slice(-2) : images;
  for (const a of selected) tasks.push({ paper:p.id, a });
}
let done=0;
for (const {paper,a} of tasks) {
  const out = path.join(work,`${a.id}.md`);
  try { await access(out); done++; continue; } catch {}
  const result = await new Promise((resolve,reject)=>{
    const child=spawn('E:/AI/MinerU/bin/mineru.exe',['parse',a.rawPath,'--output',out,'--wait','600','--json'],{windowsHide:true});
    let stdout='',stderr=''; child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d);
    child.on('error',reject); child.on('close',code=>resolve({code,stdout,stderr}));
  });
  await writeFile(path.join(work,`${a.id}.parse.json`),result.stdout || result.stderr);
  if(result.code) throw Error(`${a.id}: ${result.stderr || result.stdout}`);
  const data=JSON.parse(result.stdout);
  if(data.error || data.parse?.status !== 'done') throw Error(`${a.id}: ${JSON.stringify(data.error || data.parse)}`);
  done++;
  console.log(`${done}/${tasks.length} ${paper} ${a.filename}`);
}
console.log('Local MinerU extraction complete.');
