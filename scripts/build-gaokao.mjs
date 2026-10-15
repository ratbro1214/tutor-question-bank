import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const upstream=path.resolve(root,'../work/gaokao-import/compilation');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/gaokao/manifest.json'),'utf8').replace(/^\uFEFF/,''));
const taxonomySource=fs.readFileSync(path.join(root,'lib/senior-taxonomy.ts'),'utf8');
const triples=[...taxonomySource.matchAll(/\["([^"]+)", "([^"]+)", "([^"]+)"\]/g)].map(m=>m.slice(1));
const chapters=new Map([...taxonomySource.matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map(m=>[m[1],m[2]]));
const point=code=>{const entry=triples.find(t=>t[0]===code);if(!entry)throw Error('Unknown taxonomy '+code);return {code,name:entry[1]};};
const rules=[
 ['HS-COMPLEX-OPERATION',/复数|共轭|\\i\b|\\mathrm\{i\}/],['HS-SET-OPERATION',/集合|\\cap|\\cup|\\\\\{/],['HS-LOGIC-CONDITION',/充分|必要|充要/],
 ['HS-DERIVATIVE-GEOMETRY',/(?=.*切线)(?=.*(?:曲线|函数|\\ln|\\log))/s],['HS-DERIVATIVE-MONOTONICITY',/导数|f'|g'|极值/],
 ['HS-SEQUENCE-ARITHMETIC',/等差/],['HS-SEQUENCE-GEOMETRIC',/等比/],['HS-SEQUENCE-RECURRENCE',/数列/],
 ['HS-ANALYTIC-ELLIPSE',/椭圆/],['HS-ANALYTIC-HYPERBOLA',/双曲线/],['HS-ANALYTIC-PARABOLA',/抛物线/],['HS-ANALYTIC-CIRCLE',/圆(?!柱|锥|台|球|周)/],
 ['HS-SOLID-LINE-PLANE',/平面|棱锥|棱柱|四面体|正方体|长方体/],['HS-SOLID-SURFACE-VOLUME',/体积|侧面积|圆锥|圆柱/],['HS-SOLID-SPHERE',/球/],
 ['HS-VECTOR-DOT',/向量/],['HS-TRIANGLE-SINE-LAW',/三角形|\\triangle/],['HS-TRIG-TRANSFORM',/\\sin|\\cos|\\tan/],
 ['HS-COUNTING-BINOMIAL',/展开式|二项式/],['HS-COUNTING-PERMUTATION',/排列|安排方法/],['HS-RANDOM-EXPECTATION',/数学期望|分布列/],['HS-PROB-CLASSICAL',/概率/],['HS-STAT-CENTER',/中位数|平均数|众数/],['HS-STAT-VARIANCE',/方差|标准差/],['HS-STAT-SAMPLING',/样本|统计|频率|频数/],
 ['HS-INEQ-BASIC',/基本不等式/],['HS-LOG-FUNCTION',/\\ln|\\log/],['HS-FUNC-MONOTONICITY',/单调/],['HS-FUNC-PARITY',/奇函数|偶函数/],['HS-FUNC-DOMAIN',/定义域/],['HS-FUNC-RANGE',/值域/],['HS-FUNC-CONCEPT',/函数/],['HS-INEQ-PROPERTY',/不等式/],
];
// Resolve renamed codes against the project's actual taxonomy, never add foreign codes.
const synonyms={'HS-DERIVATIVE-GEOMETRY':'HS-DERIVATIVE-TANGENT','HS-SEQUENCE-ARITHMETIC':'HS-SEQ-ARITHMETIC','HS-SEQUENCE-GEOMETRIC':'HS-SEQ-GEOMETRIC','HS-SEQUENCE-RECURRENCE':'HS-SEQ-RECURRENCE'};
function resolve(code){if(triples.some(t=>t[0]===code))return code;const alias=synonyms[code];if(triples.some(t=>t[0]===alias))return alias;return null;}
const macros={bs:'\\boldsymbol',R:'\\mathbb{R}',Z:'\\mathbb{Z}',N:'\\mathbb{N}',e:'{\\mathrm{e}}',i:'{\\mathrm{i}}',d:'{\\mathrm{d}}',degree:'^{\\circ}'};
function group(s,offset){while(/\s/.test(s[offset]||'')&&offset<s.length)offset++;if(s[offset]!=='{')throw Error('Missing choice group');const start=++offset;let depth=1;while(offset<s.length&&depth){if(s[offset]==='{'&&s[offset-1]!=='\\')depth++;if(s[offset]==='}'&&s[offset-1]!=='\\')depth--;offset++;}if(depth)throw Error('Unclosed choice');return {text:s.slice(start,offset-1),end:offset};}
const images=new Set();
function convert(source){
 let s=source.replace(/(?<!\\)%[^\n]*/g,'');
 s=s.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g,(_,body)=>'\\[\\begin{aligned}'+body+'\\end{aligned}\\]').replace(/\\textasciitilde/g,'\\sim ');
 for(const [name,count,render] of [
  ['FigureLayoutDeclare',3,()=> ''],['renewcommand',2,()=> ''],
  ['solutionfigure',1,a=>a[0]],['examfiguregroup',2,a=>a[1]],['adjustbox',2,a=>a[1]],
  ['examdisplaycases',2,a=>'\\[ '+a[0]+'\\begin{cases}'+a[1]+'\\end{cases} \\]'],
  ['examdisplayaligned',1,a=>'\\[\\begin{aligned}'+a[0]+'\\end{aligned}\\]'],
  ['multicolumn',3,a=>a[2]],['circled',1,a=>'('+a[0]+')'],
 ]){let match;const pattern=new RegExp('\\\\'+name+'\\b(?:\\[[^\\]]*\\])?');while((match=s.match(pattern))){let end=match.index+match[0].length;const args=[];for(let n=0;n<count;n++){const g=group(s,end);args.push(g.text);end=g.end;}s=s.slice(0,match.index)+render(args)+s.slice(end);}}
 let idx;while((idx=s.search(/\\choices(?:five)?\b/))>=0){const command=s.slice(idx).match(/^\\choices(five)?\b/)[0];let end=idx+command.length;const choices=[];for(let n=0;n<(command.includes('five')?5:4);n++){const g=group(s,end);choices.push(String.fromCharCode(65+n)+'. '+g.text);end=g.end;}s=s.slice(0,idx)+'\n'+choices.join('\n')+'\n'+s.slice(end);}
 s=s.replace(/\\(?:bitmapfigure|choicebitmap|includegraphics|bitmapinclude|texfigure|choicetexfigure)(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,(_,rel)=>{
   const bitmap=rel.replace(/^img_repaint\//,'img/').replace(/\.tex$/,'.png');
   const full=path.join(upstream,bitmap);if(!fs.existsSync(full))throw Error('Missing figure '+bitmap);
   images.add(bitmap);return '\n![题图](/gaokao/assets/'+bitmap+')\n';
 });
 s=s.replace(/\\begin\{(?:sourcefigure|examfiguregroup)\}(?:\[[^\]]*\])?/g,'').replace(/\\end\{(?:sourcefigure|examfiguregroup)\}/g,'');
 const stack=[];s=s.replace(/\\begin\{(?:enumerate|circlelist)\}(?:\[[^\]]*\])?|\\end\{(?:enumerate|circlelist)\}|\\item(?:\[([^\]]*)\])?/g,(command,label)=>{if(command.startsWith('\\begin')){stack.push(0);return '\n';}if(command.startsWith('\\end')){stack.pop();return '\n';}if(!stack.length)stack.push(0);stack[stack.length-1]++;return '\n'+(label||'（'+stack.at(-1)+'）')+' ';});
 s=s.replace(/\\begin\{(?:center|flushleft|flushright|table|figure)\}(?:\[[^\]]*\])?|\\end\{(?:center|flushleft|flushright|table|figure)\}/g,'');
 s=s.replace(/\\begin\{tabular\}(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g,(_,cols,body)=>'\n'+body.replace(/\\(?:hline|toprule|midrule|bottomrule)/g,'').split(/\\\\(?:\[[^\]]*\])?/).map(row=>row.trim().split('&').map(c=>c.trim()).join(' ｜ ')).filter(Boolean).join('\n')+'\n');
 for(const [name,value]of Object.entries(macros))s=s.replace(new RegExp('\\\\'+name+'\\b','g'),()=>value);
 s=s.replace(/\\(?:textbf|textit|underline|mbox)\{([^{}]*)\}/g,'$1').replace(/\\fillinblank\b(?:\{\})?/g,'\\boxed{\\phantom{0000}}').replace(/\\(?:noindent|small|footnotesize|centering|displaystyle|begingroup|endgroup|hfill|par)\b/g,'').replace(/\\leftskip=0pt\\relax/g,'').replace(/\\cline\{[^}]*\}/g,'').replace(/\\(?:vspace|hspace)(?:\*)?\{[^}]*\}/g,' ').replace(/~+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n');
 return s.replace(/\\ (?=\\\()/g,' ').trim();
}
function classify(text,number,section){const codes=[...new Set(rules.filter(([,re])=>re.test(text)).map(([code])=>resolve(code)).filter(Boolean))].slice(0,4);const primary=codes[0];if(!primary)return null;const chapter=triples.find(t=>t[0]===primary)[2];return {schema_version:'1.0',taxonomy_version:'cn-senior-math-1.0',subject:'高中数学',education_stage:'高中',extracted_question:text,chapter:{code:chapter,name:chapters.get(chapter)},knowledge_points:codes.map(point),methods:[],question_type:/证明/.test(text)?'证明题':/概率/.test(text)?'概率计算':/\\\\(?:frac|sqrt)/.test(text)&&!/解答/.test(section)?'直接计算':'综合题',difficulty:number<=6?'基础':/解答|选修/.test(section)?'较难':'中等',presentation_form:/选择|单选|多选/.test(section)?'选择题':/填空/.test(section)?'填空题':'解答题',confidence:0.6,needs_review:true,review_reasons:['CLASSIFICATION_AMBIGUOUS'],classification_notes:'按题干关键词整理的初步分类，待教师核查；不代表已审核的知识点或方法证据。'};}
const papers=[];
for(const m of manifest){const tex=fs.readFileSync(path.join(root,'data/gaokao/sources/'+m.key+'.tex'),'utf8');const title=tex.match(/\\chapter\{([^}]+)\}/)?.[1]||m.key;const starts=[...tex.matchAll(/\\begin\{problem\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{problem\}/g)];if(starts.length!==m.expectedQuestions)throw Error('Question count mismatch');const questions=starts.map((match,i)=>{const following=tex.slice(match.index+match[0].length,starts[i+1]?.index||tex.length);const rawAnswer=(match[2]+following).match(/\\begin\{answer\}([\s\S]*?)\\end\{answer\}/)?.[1]||'';const rawSolution=(match[2]+following).match(/\\begin\{solution\}([\s\S]*?)\\end\{solution\}/)?.[1]||'';const text=convert(match[2].replace(/\\begin\{(?:answer|solution)\}[\s\S]*?\\end\{(?:answer|solution)\}/g,'')),solution=convert(rawSolution),answer=convert(rawAnswer);const section=[...tex.slice(0,match.index).matchAll(/\\section\{([^}]+)\}/g)].at(-1)?.[1]||'';return {number:i+1,text,section,classification:classify(text,i+1,section),answer,solution,rawText:match[2],rawAnswer,rawSolution,textSha256:crypto.createHash('sha256').update(text).digest('hex')};});papers.push({...m,title:title+' · 数学',questions});}
for(const rel of images){const dest=path.join(root,'public/gaokao/assets',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(upstream,rel),dest);}
const catalog={version:'gaokao-2017-2026-v1',notice:'试题原权利归命题方；整理内容依各上游许可保留署名。本项目转换题干排版，保留原始 TeX、PDF 和校验值。参考解析与初步分类均未经过教师审核。',papers};
fs.writeFileSync(path.join(root,'data/gaokao/catalog.json'),JSON.stringify(catalog,null,2));
console.log(JSON.stringify({papers:papers.length,questions:papers.reduce((n,p)=>n+p.questions.length,0),figures:images.size,unmatchedTaxonomy:rules.filter(([c])=>!resolve(c)).map(([c])=>c)}));


