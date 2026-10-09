import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('data/english/manifest.json','utf8'));
const additions=[
 ['gaokao_en_2020_II','answer','https://gaokao.eol.cn/shiti/zhenti/202205/t20220527_2227908.shtml'],
 ['gaokao_en_2022_I','answer','https://gaokao.eol.cn/shiti/zhenti/202206/t20220610_2230990.shtml'],
 ['gaokao_en_2022_II','answer','https://gaokao.eol.cn/shiti/yy/202211/t20221130_2258743.shtml'],
 ['gaokao_en_2023_I','answer','https://gaokao.eol.cn/shiti/yy/202306/t20230611_2435473.shtml'],
 ['gaokao_en_2023_II','answer','https://gaokao.eol.cn/shiti/yy/202306/t20230611_2435470.shtml'],
 ['gaokao_en_2025_I','paper','https://gaokao.eol.cn/shiti/yy/202506/t20250612_2674288.shtml'],
];
for(const [id,kind,base] of additions) {
 const p=manifest.papers.find(p=>p.id===id), queue=[base];
 if(id==='gaokao_en_2025_I') for(const a of p.artifacts) if(a.sourcePage.includes('2674296') && a.kind==='paper') a.kind='answer';
 for(const url of queue){
  const r=await fetch(url); if(!r.ok) throw Error(url); const bytes=Buffer.from(await r.arrayBuffer()),html=bytes.toString('utf8');
  if(url===base){const count=Number(html.match(/_PAGE_COUNT\s*=\s*"(\d+)"/)?.[1]||1);for(let n=1;n<count;n++)queue.push(base.replace('.shtml',`_${n}.shtml`));}
  const body=html.match(/<div[^>]*class=["']?TRS_Editor[^>]*>([\s\S]*?)<div class="perpage"/i)?.[1]||html.match(/<div[^>]*class=["']?TRS_Editor[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if(!body)throw Error('article missing');
  async function save(data,sourceUrl,type,ext,mime){
   const sha256=createHash('sha256').update(data).digest('hex'),aid=`${id}_${sha256.slice(0,16)}`;
   if(p.artifacts.some(a=>a.id===aid))return;
   const filename=`${id}__${type}__${sha256.slice(0,12)}${ext}`, rawPath=path.resolve('../outputs/english-exams/raw',id,filename);
   await writeFile(rawPath,data);let publicPath=null;
   if(type!=='html_snapshot'){publicPath=`/english-exams/${id}/${filename}`;await mkdir(path.dirname(`public${publicPath}`),{recursive:true});await writeFile(`public${publicPath}`,data);}
   p.artifacts.push({id:aid,kind:type,sourceUrl,sourcePage:url,sourceName:'中国教育在线',sourceTier:'A-',sha256,filename,rawPath,publicPath,mime,bytes:data.length,capturedAt:new Date().toISOString(),license:null});
  }
  await save(bytes,url,'html_snapshot','.html','text/html');
  for(const m of body.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
   const asset=new URL(m[1].replaceAll('&amp;','&'),url).href;if(!/\.(png|jpg|jpeg|pdf|docx?)$/i.test(asset))continue;
   const r=await fetch(asset);if(!r.ok)throw Error(asset);await save(Buffer.from(await r.arrayBuffer()),asset,kind,path.extname(new URL(asset).pathname),r.headers.get('content-type'));
  }
 }
 console.log(id,kind,'supplement archived');
}
await writeFile('data/english/manifest.json',JSON.stringify(manifest,null,2));
await writeFile('../outputs/english-exams/manifest.json',JSON.stringify(manifest,null,2));
