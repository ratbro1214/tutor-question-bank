/* Six user-selected organizing ideas. Source records and competency nodes stay intact. */
(function(root){
 'use strict';
 const data=root.THOUGHT_TAXONOMY_DATA,graph=root.NETWORK;
 if(!data||!graph)throw new Error('Missing thought taxonomy or graph');
 const by=new Map(graph.nodes.map(n=>[n.id,n])),active=e=>e.active!==false&&e.status!=='source_flagged';
 const thoughts=data.thoughts.map(t=>{
  let n=by.get(t.id);
  if(!n){n={id:t.id,bookIds:[],chapterIds:[],competencyIds:[],competencyTagIds:[],competencyFacets:[],customTags:[],tags:{},evidence:[]};graph.nodes.push(n);by.set(n.id,n);}
  n.legacyClassification={name:n.name||null,type:n.type||null};
  Object.assign(n,{name:t.name,type:'THOUGHT',description:t.description,aliases:[...new Set([...(n.aliases||[]),...t.aliases])],thoughtDefinition:t});
  return n;
 });
 const thoughtIds=new Set(thoughts.map(n=>n.id)),process=by.get('kp:21395');
 for(const change of data.knowledgeDisplayNames||[]){const n=by.get(change.id);if(n?.type==='KNOWLEDGE'){n.originalName=n.name;n.name=change.name;n.aliases=[...new Set([...(n.aliases||[]),change.originalName])];}}
 if(process){process.legacyClassification={name:process.name,type:process.type};process.type='THINKING_PROCESS';process.description='观察实例，归纳并提出猜想，再在一般条件下论证；归纳得到的猜想不能替代证明。';}
 for(const e of graph.edges){
  const s=by.get(e.source),t=by.get(e.target),old={type:e.type,source:e.source,target:e.target,rationale:e.rationale};
  if(s?.type==='THOUGHT'&&e.type==='SPECIALIZES_TO')e.type='GUIDES_METHOD';
  else if(t?.type==='THOUGHT'&&e.type==='SOLVED_BY')e.type='ILLUSTRATES_THOUGHT';
  else if(s?.type==='THOUGHT'&&e.type==='USES_KNOWLEDGE'){e.type='ILLUSTRATES_THOUGHT';[e.source,e.target]=[e.target,e.source];}
  else if(t?.type==='THINKING_PROCESS'&&['SOLVED_BY','INCLUDES_METHOD','SPECIALIZES_TO'].includes(e.type))e.type='USES_PROCESS';
  else if(s?.type==='THINKING_PROCESS'&&e.type==='USES_KNOWLEDGE')e.type='EXPLORES_KNOWLEDGE';
  if(e.type!==old.type){e.legacyRelation=old;e.reason=e.type==='GUIDES_METHOD'?'该方法体现这一思想；具体操作仍须满足方法自身的适用条件。':e.type==='ILLUSTRATES_THOUGHT'?'此知识内容的学习或应用体现这一思想。':'在学习或研究中运用这一思维过程。';e.rationale=e.reason;e.taxonomyVersion=data.version;}
 }
 for(const c of data.connections){
  const n=by.get(c.nodeId);if(!n)throw new Error('Unknown thought endpoint: '+c.nodeId);
  const isMethod=['METHOD','SKILL'].includes(n.type),isProcess=n.type==='THINKING_PROCESS';
  const source=isMethod||isProcess?c.thoughtId:c.nodeId,target=isMethod||isProcess?c.nodeId:c.thoughtId;
  const type=isMethod?'GUIDES_METHOD':isProcess?'USES_PROCESS':'ILLUSTRATES_THOUGHT';
  const duplicate=graph.edges.find(e=>active(e)&&e.source===source&&e.target===target&&e.type===type);
  if(duplicate){duplicate.thoughtMapping=c;continue;}
  graph.edges.push({id:'thought-link:'+c.thoughtId+':'+c.nodeId,source,target,type,active:true,status:'editorial_mapping',reason:c.reason,rationale:c.reason,evidence:c.contentIds,thoughtMapping:c,taxonomyVersion:data.version});
 }
 const concrete=n=>n&&['METHOD','SKILL'].includes(n.type)&&n.id!=='kp:21169';
 const unique=rows=>[...new Map(rows.filter(Boolean).map(n=>[n.id,n])).values()];
 const incident=new Map(graph.nodes.map(n=>[n.id,[]]));
 for(const e of graph.edges.filter(active)){incident.get(e.source)?.push(e);incident.get(e.target)?.push(e);}
 function methodKnowledge(id){return unique((incident.get(id)||[]).filter(e=>['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)).map(e=>by.get(e.source===id?e.target:e.source)).filter(n=>n?.type==='KNOWLEDGE'));}
 function methodsFor(id){return unique((incident.get(id)||[]).filter(e=>['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)).map(e=>by.get(e.source===id?e.target:e.source)).filter(concrete));}
 function members(id){
  const edges=(incident.get(id)||[]).filter(e=>['ILLUSTRATES_THOUGHT','GUIDES_METHOD','USES_PROCESS'].includes(e.type));
  const nodes=unique(edges.map(e=>by.get(e.source===id?e.target:e.source))),knowledge=nodes.filter(n=>n.type==='KNOWLEDGE'),methods=nodes.filter(concrete),processes=nodes.filter(n=>n.type==='THINKING_PROCESS');
  const via=new Map();for(const m of methods)for(const k of methodKnowledge(m.id)){if(!via.has(k.id))via.set(k.id,{node:k,methodIds:[]});via.get(k.id).methodIds.push(m.id);}
  const viaMethods=[...via.values()].filter(r=>!knowledge.some(n=>n.id===r.node.id));
  return {knowledge,methods,processes,viaMethods,edges};
 }
 const memberCache=new Map(thoughts.map(n=>[n.id,members(n.id)]));
 function related(id){return thoughts.flatMap(n=>{const m=memberCache.get(n.id),direct=m.knowledge.some(k=>k.id===id)||m.methods.some(k=>k.id===id)||m.processes.some(k=>k.id===id),via=m.viaMethods.find(r=>r.node.id===id);return direct||via?[{node:n,direct,viaMethodIds:via?.methodIds||[]}]:[];});}
 function project(nodes){const scope=new Set(nodes.map(n=>n.id));return thoughts.map(node=>{const m=memberCache.get(node.id),direct=m.knowledge.filter(k=>scope.has(k.id)),via=m.viaMethods.filter(r=>scope.has(r.node.id));return {node,directCount:direct.length,viaCount:via.length,count:direct.length+via.length};});}
 for(const n of thoughts){
  const m=memberCache.get(n.id),context=[...m.knowledge,...m.methods,...m.viaMethods.map(r=>r.node)];
  n.bookIds=[...new Set(context.flatMap(x=>x.bookIds||[]))];n.chapterIds=[...new Set(context.flatMap(x=>x.chapterIds||[]))];
  // Navigation scope is derived from linked content; it is not a new competency attribution.
  n.navigationCompetencyIds=[...new Set(context.flatMap(x=>x.competencyTagIds||x.competencyIds||[]))];
 }
 const decisions=root.METHOD_DECISIONS;
 const labelChanges={
  'method-label:analogy':{name:'类比迁移',role:'思维过程',description:'依据两个对象的结构或关系相似性提出理解与猜想，再核对定义、条件与结论。类比并不保证结论成立。'},
  'method-label:induction':{name:'归纳猜想',role:'思维过程',description:'从若干实例中观察共同规律并提出猜想，随后还需论证。这里的归纳过程与作为严格证明方法的数学归纳法分别保留。'},
  'method-label:randomness':{name:'随机观念',role:'专题观念',description:'认识单次结果的不确定性与大量重复试验中的统计规律，结合概率模型理解和处理问题。'},
  'proposal:book-4:definition-method':{name:'回到定义',role:'研究策略',description:'回到对象的定义、条件和表达形式，确定下一步推理或计算的依据。具体实施可形成不同的定义法。'}
 };
 if(decisions){
  for(const [id,change]of Object.entries(labelChanges)){const l=decisions.methodLabels[id];if(!l)continue;l.legacyClassification={name:l.name,kind:l.kind};l.aliases=[...new Set([...(l.aliases||[]),l.name])];Object.assign(l,change,{kind:'thinking_support'});}
  const old=decisions.DOTR23ThoughtEntries?.['proposal:book-1:abstraction-thought'];
  if(old){decisions.methodLabels['process-label:abstraction']={id:'process-label:abstraction',name:'抽象概括',role:'思维过程',kind:'thinking_support',aliases:['抽象思想','抽象思维','具体到抽象'],description:'从具体对象和情境中提取数量关系与共同结构，并形成概念或模型。此处说明学习过程；数学抽象核心素养仍作为课程目标保留。',nodeIds:['kp:21085','method:function-modeling'],chapterIds:[...new Set(['kp:21085','method:function-modeling'].flatMap(id=>by.get(id)?.chapterIds||[]))],sourceChapterPlacements:[],references:old.contentIds.map(contentId=>({contentId,title:root.R80_READING_INDEX?.contentLabels?.[contentId]?.title||'抽象概括的教案应用',sourceIds:['L244']}))};}
 }
 by.get('method-family:sequences-recursion').name='数列与递推方法';
 by.get('method-family:modeling').name='数学建模方法';
 for(const n of [by.get('method-family:sequences-recursion'),by.get('method-family:modeling')])n.aliases=[...(n.aliases||[]),n.id==='method-family:modeling'?'数学建模（方法族）':'归纳递推'];
 graph.metadata.thoughtTaxonomy={version:data.version,basis:data.basis,officialClosedList:false,situationsAreKnowledgeNodes:false};
 graph.metadata.rootModel='素养统领课程；教材和章节组织知识；知识点关联可用方法；六大思想横向联系知识与方法。';
 graph.metadata.counts.nodes=graph.nodes.length;graph.metadata.counts.edges=graph.edges.length;
 graph.metadata.counts.edgeTypes=graph.edges.reduce((a,e)=>(a[e.type]=(a[e.type]||0)+1,a),{});
 graph.metadata.counts.edgeStatuses=graph.edges.reduce((a,e)=>(a[e.status]=(a[e.status]||0)+1,a),{});
 for(const key of ['nodeTypes','byType'])if(graph.metadata.counts[key])graph.metadata.counts[key]=graph.nodes.reduce((a,n)=>(a[n.type]=(a[n.type]||0)+1,a),{});
 root.ThoughtTaxonomy={data,thoughts,thoughtIds,related,project,members:id=>memberCache.get(id),node:id=>by.get(id),methodKnowledge,methodsFor};
})(window);
