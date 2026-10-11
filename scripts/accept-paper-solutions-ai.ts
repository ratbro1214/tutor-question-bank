// Human-labeled small arithmetic fixtures. No database or R2 mutation.
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuredExplanationProvider } from '../lib/ai-provider';
import { requestSolutionReview } from '../lib/paper-solution-ai';
import { solutionQualitySchema,solutionMethodsSchema } from '../lib/paper-solutions';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../outputs');mkdirSync(out,{recursive:true});
let settings:Record<string,string>={};
try{for(const line of readFileSync(resolve(root,'.dev.vars'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m)settings[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}catch{/* report unavailable */}
const provider=configuredExplanationProvider(settings),results:unknown[]=[];
if(!provider.apiKey){writeFileSync(resolve(out,'5B-2-真实模型样本.json'),JSON.stringify({available:false,reason:'No configured local provider',realRequests:0},null,2));process.exit(0);}
const samples=[{name:'人为设置明确计算错误',text:'求 2+2 的值。',reference:'解：2+2=5，因此答案为5。',expected:'error_detected'},
 {name:'原解析正确且合理',text:'求 2+2 的值。',reference:'解：2+2=4，因此答案为4。',expected:'no_obvious_error'},
 {name:'缺少必要图形',text:'如图，求角 A 的大小。图形未提供。',reference:'解：角A为60度。',expected:'insufficient'}];
let calls=0;
for(const s of samples){const start=Date.now();try{calls++;const context={question:{text:s.text,educationStage:'初中'},source:{text:s.reference},visualVerified:false};const result=solutionQualitySchema.parse(await requestSolutionReview('quality',context,provider));results.push({name:s.name,humanLabel:s.expected,result,matchedHumanLabel:result.verdict===s.expected,elapsedMs:Date.now()-start});
 if(s.expected==='no_obvious_error'){calls++;const methods=solutionMethodsSchema.parse(await requestSolutionReview('methods',{...context,quality:result},provider));results.push({name:'合理原解无需强制优化',humanLabel:'keep_original with no alternatives',result:methods,matchedHumanLabel:methods.recommendation==='keep_original'&&methods.alternatives.length===0});}
 }catch(e){results.push({name:s.name,error:e instanceof Error?e.message:'failed'});}
 writeFileSync(resolve(out,'5B-2-真实模型样本.json'),JSON.stringify({available:true,model:provider.model,realRequests:calls,results,limitation:'Small human-labeled arithmetic samples; not a benchmark of full mathematical proofs or scanned PDFs.'},null,2));
 console.log(s.name+' 完成');
}
