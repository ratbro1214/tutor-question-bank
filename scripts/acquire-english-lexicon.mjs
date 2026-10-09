import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
const revision='bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b';
const repo='https://github.com/skywind3000/ECDICT';
const base=`https://raw.githubusercontent.com/skywind3000/ECDICT/${revision}`;
const dir='../work/english-lexicon';
await mkdir(dir,{recursive:true});
await mkdir('../outputs/english-exams/vocabulary',{recursive:true});
let license;
try { license=await readFile('data/english/ECDICT-LICENSE.txt','utf8'); }
catch { const licenseResponse=await fetch(`${base}/LICENSE`); if(!licenseResponse.ok)throw Error(`License download HTTP ${licenseResponse.status}`); license=await licenseResponse.text(); }
if(!license.startsWith('MIT License'))throw Error('Unexpected dictionary license');
await writeFile('data/english/ECDICT-LICENSE.txt',license);
await writeFile('../outputs/english-exams/vocabulary/ECDICT-LICENSE.txt',license);
const csv=`${dir}/ecdict-${revision}.csv`;
try{await access(csv);}catch{
  const response=await fetch(`${base}/ecdict.csv`);
  if(!response.ok || !response.body)throw Error(`Dictionary download HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(`${csv}.part`));
  await rename(`${csv}.part`,csv);
}
const hash=createHash('sha256');let bytes=0;
for await(const chunk of createReadStream(csv)){hash.update(chunk);bytes+=chunk.length;}
const source={name:'ECDICT',repository:repo,revision,sourceUrl:`${base}/ecdict.csv`,license:'MIT',licenseUrl:`${base}/LICENSE`,sha256:hash.digest('hex'),bytes,rawPath:csv,capturedAt:new Date().toISOString()};
await writeFile(`${dir}/source.json`,JSON.stringify(source,null,2));
console.log('ECDICT downloaded to E drive:',bytes,'bytes; revision',revision);
