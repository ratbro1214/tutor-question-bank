import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import type { PaperPage } from '../lib/paper';

const execute = promisify(execFile);
const guid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type Job = { paper: string; source: string; status: 'running'|'completed'|'failed'; pages?: PaperPage[]; error?: string };

// Development only. No remote URL, filesystem path or shell command is accepted.
export function localSolutionOCR(enabled: boolean): Plugin {
 const jobs = new Map<string, Job>(); let root = '';
 const shutdown = new AbortController();
 return { name: 'local-solution-ocr', configResolved(config) { root = config.root; }, configureServer(server) {
  if (!enabled || process.platform !== 'win32') return;
  server.httpServer?.once('close', () => shutdown.abort());
  server.middlewares.use(async (req, res, next) => {
   if (!req.url?.startsWith('/__local/solution-ocr')) return next();
   const send = (status: number, value: unknown) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(value)); };
   try {
    const origin = new URL(`http://${req.headers.host}`), url = new URL(req.url, origin);
    const address=server.httpServer?.address();
    if(!address||typeof address==='string'||Number(origin.port||80)!==address.port)return send(403,{error:'本地服务地址无效。'});
    if (!['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || !['::1','127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') || req.headers.origin && req.headers.origin !== origin.origin || req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'仅允许本机同源识别。'});
    if (req.method !== 'POST' && req.method !== 'GET') return send(405,{error:'方法不支持。'});
    let paper='', source='', jobId='';
    if (req.method==='POST') {
     let body=''; for await (const chunk of req) { body+=chunk; if(body.length>1024) return send(413,{error:'请求过大。'}); }
     ({paperId:paper,sourceId:source}=JSON.parse(body));
    } else {
     jobId=url.searchParams.get('job')||''; const job=jobs.get(jobId);
     if(!job)return send(404,{error:'识别任务不存在，请重试。'});
     ({paper,source}=job);
    }
    if(!guid.test(paper)||!guid.test(source))return send(400,{error:'解析来源无效。'});
    // Worker endpoint enforces the current session, owner and library scope.
    const headers = req.headers.cookie ? {cookie:req.headers.cookie} : undefined;
    const file=await fetch(new URL(`/api/papers/${paper}/solutions/${source}/file`,origin),{headers,redirect:'error',signal:AbortSignal.any([shutdown.signal,AbortSignal.timeout(30000)])});
    if(!file.ok)return send(file.status,{error:'原文件不存在或无权访问。'});
    if(req.method==='GET') {await file.body?.cancel(); return send(200,{jobId,...jobs.get(jobId)});}
    const existing=[...jobs].find(([,j])=>j.paper===paper&&j.source===source&&j.status!=='failed');
    if(existing){await file.body?.cancel();return send(200,{jobId:existing[0],...existing[1]});}
    if([...jobs.values()].some(j=>j.status==='running')){await file.body?.cancel();return send(409,{error:'另一份解析正在本地识别，请完成后再处理此文件。'});}
    if(jobs.size>=20){const old=[...jobs].find(([,j])=>j.status!=='running');if(old)jobs.delete(old[0]);}
    // Reserve before reading the body: concurrent clicks cannot start two engines.
    const id=randomUUID(), job:Job={paper,source,status:'running'}; jobs.set(id,job);
    void (async()=>{
     try {
      const bytes=Buffer.from(await file.arrayBuffer());
      if(bytes.length>40*1024*1024||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('需要40MB以内的PDF文件。');
      const hash=createHash('sha256').update(bytes).digest('hex'), folder=resolve(root,'../work/local-solution-ocr',hash);
      await mkdir(folder,{recursive:true}); await writeFile(resolve(folder,'source.pdf'),bytes);
      const output=resolve(folder,'lines-v2.json');
      let parsed: {pages:PaperPage[]};
      try {parsed=JSON.parse(await readFile(output,'utf8'));}
      catch {await execute(process.env.LOCAL_MINERU_PYTHON||'E:/AI/MinerU/tools/mineru/Scripts/python.exe',[resolve(root,'scripts/local-solution-ocr.py'),resolve(folder,'source.pdf'),output],{windowsHide:true,signal:shutdown.signal,timeout:300000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONUTF8:'1',TEMP:'E:/AI/Temp',TMP:'E:/AI/Temp',HF_HOME:'E:/AI/MinerU/cache/huggingface',XDG_CACHE_HOME:'E:/AI/MinerU/cache'}});parsed=JSON.parse(await readFile(output,'utf8'));}
      job.pages=parsed.pages; job.status='completed';
     } catch(error) {job.status='failed';job.error='本地识别失败，请重试；原文件保留。'+(error instanceof Error&&'code' in error&&error.code==='ENOENT'?' 未找到已安装的MinerU运行环境。':''); server.config.logger.error(String(error));}
    })();
    return send(202,{jobId:id,...job});
   } catch {return send(400,{error:'本地识别请求失败。'});}
  });
 }};
}
