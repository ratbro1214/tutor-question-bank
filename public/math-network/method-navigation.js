/* Read-only teaching navigation. Every association comes from an existing ID or active edge. */
(function(root){
 'use strict';
 const roles=Object.freeze({'method-label:analogy':'思维过程','method-label:induction':'思维过程','method-label:randomness':'专题观念','proposal:book-4:definition-method':'研究策略','process-label:abstraction':'思维过程'});
 const organizationGroups=Object.freeze([
  {id:'course:/G340/G342',name:'11.2 锥体',members:['kp:21155'],basis:'沿用原平台目录 11.2 锥体①②③的课时归属。',pending:['kp:21155']},
  {id:'kp:21169',name:'系统抽样与分层抽样',members:['atom:21169:1','atom:21169:2'],basis:'沿用原复合条目的拆分关系，两个知识点并列呈现。',pending:['atom:21169:1']}
 ]);
 let cachedGraph=null,cachedIndex=null;
 function graph(){return root.NETWORK||{nodes:[],edges:[]};}
 function node(id){if(cachedGraph!==graph()||cachedIndex?.size!==graph().nodes.length){cachedGraph=graph();cachedIndex=new Map(cachedGraph.nodes.map(n=>[n.id,n]));}return cachedIndex.get(id);}
 const active=e=>e.active!==false&&e.status!=='source_flagged';
 const unique=rows=>[...new Map(rows.map(n=>[n.id,n])).values()];
 const concrete=n=>n&&['METHOD','SKILL'].includes(n.type)&&n.id!=='kp:21169';
 function labels(){return Object.values(root.METHOD_DECISIONS?.methodLabels||{});}
 function families(){return graph().nodes.filter(n=>n.type==='METHOD_FAMILY');}
 function labelNodes(id){const l=root.METHOD_DECISIONS?.methodLabels?.[id];return unique((l?.nodeIds||[]).map(node).filter(Boolean));}
 function members(id){return unique(graph().edges.filter(e=>active(e)&&e.type==='SPECIALIZES_TO'&&e.source===id).map(e=>node(e.target)).filter(Boolean));}
 function applications(id){
  const d=root.METHOD_DECISIONS||{},ex=d.exercisePresentation19?.entries||{};
  return unique([...Object.values(d.applicationBranches||{}).filter(a=>!ex[a.id]),...Object.values(d.DOTR24D7KnowledgeEntries||{})].filter(a=>a.nodeIds.includes(id)));
 }
 function related(id){
  const methods=[],knowledge=[],directFamilies=[],edgeIds=[];
  for(const e of graph().edges){
   if(!active(e))continue;
   const k=e.type==='SOLVED_BY'?node(e.source):e.type==='USES_KNOWLEDGE'?node(e.target):null;
   const m=e.type==='SOLVED_BY'?node(e.target):e.type==='USES_KNOWLEDGE'?node(e.source):null;
   if(k?.type==='KNOWLEDGE'&&m?.type==='METHOD_FAMILY'){
    if(k.id===id){directFamilies.push(m);edgeIds.push(e.id);}
    if(m.id===id){knowledge.push(k);edgeIds.push(e.id);}
   }
   if(k?.type!=='KNOWLEDGE'||!concrete(m))continue;
   if(k.id===id){methods.push(m);edgeIds.push(e.id);}
   if(m.id===id){knowledge.push(k);edgeIds.push(e.id);}
  }
  const targets=new Set([id,...methods.map(n=>n.id)]);
  const familyEdges=graph().edges.filter(e=>active(e)&&e.type==='SPECIALIZES_TO'&&targets.has(e.target)&&node(e.source)?.type==='METHOD_FAMILY');
  return {thoughts:root.ThoughtTaxonomy?.related(id)||[],labels:labels().filter(l=>l.nodeIds.includes(id)),methods:unique(methods),knowledge:unique(knowledge),families:unique([...directFamilies,...familyEdges.map(e=>node(e.source))]),applications:applications(id),edgeIds,familyEdgeIds:familyEdges.map(e=>e.id)};
 }
 function organization(id){return organizationGroups.find(g=>g.id===id||g.members.includes(id))||null;}
 function groupsFor(rows){return organizationGroups.map(g=>({...g,nodes:rows.filter(n=>g.members.includes(n.id))})).filter(g=>g.nodes.length);}
 function role(n){return n.id==='kp:21169'?'抽样组织入口':({THOUGHT:'数学思想',THINKING_PROCESS:'思维过程',KNOWLEDGE:'知识点',METHOD:'解题方法',SKILL:'应用能力',METHOD_FAMILY:'方法族',CHAPTER:'章节'})[n.type]||'课程入口';}
 root.MethodNavigation=Object.freeze({roles,labels,families,labelNodes,members,related,applications,organization,groupsFor,role,concrete,node});
})(window);
