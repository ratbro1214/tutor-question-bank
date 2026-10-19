(function(root){
 'use strict';
 // A curriculum projection, not a new prerequisite graph. IDs and source edges stay intact.
 // S30 display grouping keeps canonical records and source identities intact.
 function displayId(id){for(const [canonical,g] of Object.entries(root.R80_PRESENTATION_DATA?.displayEntryGroups||{}))if(g.memberOriginalIds.includes(id))return canonical;return id;}
 function displayMembers(id){const canonical=displayId(id);return root.R80_PRESENTATION_DATA?.displayEntryGroups?.[canonical]?.memberOriginalIds||[canonical];}
 function displayEntries(rows,all=rows){const by=new Map(all.map(n=>[n.id,n])),seen=new Set(),out=[];for(const n of rows){const id=displayId(n.id);if(seen.has(id))continue;seen.add(id);const members=displayMembers(id),base=by.get(id)||n;out.push(members.length>1?{...base,aliases:[...new Set([...(base.aliases||[]),...members,...members.map(mid=>by.get(mid)?.name).filter(Boolean)])],displayOriginalIds:members}:base);}return out;}
 function create(graph,{facets=n=>n.competencyTagIds||n.competencyIds||[],eligible=e=>e.active!==false&&e.status!=='source_flagged'}={}){
  const rawNodes=graph.nodes,nodes=displayEntries(rawNodes,rawNodes),index=new Map(nodes.map(n=>[n.id,n])),byId=id=>index.get(id);
  const ofType=type=>nodes.filter(n=>n.type===type),cores=ofType('COMPETENCY'),books=ofType('TEXTBOOK'),chapters=ofType('CHAPTER'),knowledge=ofType('KNOWLEDGE');
  const methods=nodes.filter(n=>['METHOD','SKILL'].includes(n.type)&&n.id!=='kp:21169');
  const links=graph.edges.filter(e=>eligible(e)&&['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type));
  const methodLinks=new Map();
  for(const e of links){
   const k=e.type==='SOLVED_BY'?byId(e.source):byId(e.target),m=e.type==='SOLVED_BY'?byId(e.target):byId(e.source);
   if(k?.type!=='KNOWLEDGE'||!['METHOD','SKILL'].includes(m?.type)||m.id==='kp:21169')continue;
   if(!methodLinks.has(k.id))methodLinks.set(k.id,[]);
   methodLinks.get(k.id).push({knowledgeId:k.id,methodId:m.id,edge:e,kind:e.type==='SOLVED_BY'?'solve':'uses'});
  }
  // Reuse recorded directory edges. Collapsed paths are navigation, never prerequisites.
  const locationParents=new Map(),locationCache=new Map();
  for(const e of graph.edges)if(eligible(e)&&['CONTAINS','TEACHES'].includes(e.type)){
   if(!locationParents.has(e.target))locationParents.set(e.target,[]);
   locationParents.get(e.target).push(e);
  }
  function curriculumPaths(id){
   id=displayId(id);if(locationCache.has(id))return locationCache.get(id);
   const n=byId(id);if(n?.type!=='KNOWLEDGE')return [];
   if(n.curriculumPlacements?.length){
    const paths=n.curriculumPlacements.map(p=>{
     const nodeIds=[p.bookId,p.chapterId,p.sectionId,id];
     const edges=nodeIds.slice(1).map((target,i)=>(locationParents.get(target)||[]).find(e=>e.source===nodeIds[i]));
     if(edges.some(e=>!e))throw Error('Incomplete approved curriculum path '+id);
     return {...p,nodeIds,edges,basis:'source_matched_placement'};
    });
    locationCache.set(id,paths);return paths;
   }

   const found=[],queue=[{nodeIds:[id],edges:[]}];
   while(queue.length){
    const path=queue.shift(),first=path.nodeIds[0],parent=byId(first);
    if(parent?.type==='TEXTBOOK'){if(path.nodeIds.some(x=>byId(x)?.type==='CHAPTER'))found.push(path);continue;}
    for(const e of locationParents.get(first)||[]){
     if(path.nodeIds.includes(e.source))continue;
     queue.push({nodeIds:[e.source,...path.nodeIds],edges:[e,...path.edges]});
    }
   }
   const paths=[];
   for(const chapterId of n.chapterIds||[]){
    const candidates=found.filter(p=>p.nodeIds.includes(chapterId));
    const precise=candidates.filter(p=>p.nodeIds.some(x=>byId(x)?.type==='SECTION'));
    if(candidates.length)paths.push(...(precise.length?precise:candidates));
    else for(const bookId of n.bookIds||[])if(byId(chapterId)?.bookIds.includes(bookId)){
     paths.push({nodeIds:[bookId,chapterId,id],edges:[],basis:'recorded_membership'});
    }
   }
   const unique=[...new Map(paths.map(p=>[p.nodeIds.join('|'),p])).values()];
   locationCache.set(id,unique);return unique;
  }
  function curriculumEdges(visibleNodes){
   const visible=new Set(visibleNodes.map(n=>n.id)),out=new Map();
   const existing=new Set(graph.edges.filter(eligible).map(e=>e.source+'|'+e.target+'|'+e.type));
   for(const n of visibleNodes)for(const path of curriculumPaths(n.id)){
    const shown=path.nodeIds.filter(id=>visible.has(id));
    for(let i=1;i<shown.length;i++){
     const source=shown[i-1],target=shown[i];
     if(['CONTAINS','TEACHES'].some(t=>existing.has(source+'|'+target+'|'+t)))continue;
     const start=path.nodeIds.indexOf(source),end=path.nodeIds.indexOf(target),segment=path.edges.slice(start,end);
     const id='curriculum-location:'+source+':'+target;
     const placement=path.label?path.label+'：':'';
     if(!out.has(id))out.set(id,{id,source,target,type:'CURRICULUM_LOCATION',status:'design_navigation',active:true,
      sourceEdgeIds:segment.map(e=>e.id),sourceNodeIds:path.nodeIds.slice(start,end+1),
      evidence:[...new Set(segment.length?segment.flatMap(e=>e.evidence||[]):n.evidence||[])],
      rationale:placement+'教材目录路径：'+path.nodeIds.slice(start,end+1).map(x=>byId(x)?.name||x).join(' → ')+'。按已有目录及归属显示。'});
    }
   }
   return [...out.values()];
  }
  function project(selection={},filters={}){
   const selectedFacets=(filters.facets||[]).filter(id=>byId(id)?.type==='COMPETENCY');
   const matches=n=>!selectedFacets.length||selectedFacets.some(id=>facets(n).includes(id));
   const matchesKnowledge=knowledge.filter(matches),count=(list,id,key)=>list.filter(n=>(n[key]||[]).includes(id)).length;
   const bookRows=books.map(n=>({node:n,count:count(matchesKnowledge,n.id,'bookIds'),total:count(knowledge,n.id,'bookIds')}));
   const requestedBook=filters.bookFilter||selection.bookId;
   const book=byId(requestedBook)?.type==='TEXTBOOK'?byId(requestedBook):bookRows.find(r=>r.count)?.node||books[0];
   const chapterRows=chapters.filter(n=>n.bookIds.includes(book?.id)).map(n=>({node:n,count:count(matchesKnowledge,n.id,'chapterIds'),total:count(knowledge,n.id,'chapterIds')}));
   const chapter=chapterRows.find(r=>r.node.id===selection.chapterId)?.node||chapterRows.find(r=>r.count)?.node||chapterRows[0]?.node;
   const chapterKnowledge=matchesKnowledge.filter(n=>n.chapterIds.includes(chapter?.id));
   const selectedKnowledge=chapterKnowledge.find(n=>n.id===selection.knowledgeId)||null;
   const query=String(selection.query||'').normalize('NFKC').trim().toLocaleLowerCase();
   const knowledgeRows=chapterKnowledge.filter(n=>!query||[n.name,...n.aliases||[]].some(v=>v.normalize('NFKC').toLocaleLowerCase().includes(query)));
   const activeLinks=(selectedKnowledge?[selectedKnowledge]:chapterKnowledge).flatMap(n=>methodLinks.get(n.id)||[]);
   const linkedIds=new Set(activeLinks.map(l=>l.methodId));
   const methodRows=filters.methods===false?[]:methods.filter(n=>linkedIds.has(n.id));
   const additionalMethods=filters.methods===false||selectedKnowledge?[]:methods.filter(n=>!linkedIds.has(n.id)&&n.chapterIds.includes(chapter?.id));
   const nav=root.MethodNavigation,scopeNodes=selectedKnowledge?[selectedKnowledge]:chapterKnowledge;
   const related=scopeNodes.map(n=>nav?.related(n.id));
   const thoughtRows=filters.thoughts===false?[]:(root.ThoughtTaxonomy?.project(scopeNodes)||[]);
   const selectedThought=thoughtRows.find(r=>r.node.id===selection.thoughtId)?.node||null;
   const thoughtMembers=selectedThought?root.ThoughtTaxonomy.members(selectedThought.id):null;
   const thoughtMatches=thoughtMembers?new Set([...thoughtMembers.knowledge,...thoughtMembers.methods,...thoughtMembers.viaMethods.map(r=>r.node)].map(n=>n.id)):null;
   const ideaLabels=nav?.labels().filter(l=>scopeNodes.some(n=>l.nodeIds.includes(n.id)))||[];
   const familyRows=filters.methods===false?[]:[...new Map(related.flatMap(r=>r?.families||[]).map(n=>[n.id,n])).values()];
   const knowledgeApplications=filters.methods===false?[]:related.flatMap(r=>r?.applications||[]);
   const selectedMethod=[...methodRows,...additionalMethods,...familyRows].find(n=>n.id===selection.methodId)||null;
   const organizationGroups=nav?.groupsFor(knowledgeRows)||[];
   const placementLabels=Object.fromEntries(knowledgeRows.map(n=>[n.id,(n.curriculumPlacements||[]).filter(p=>p.bookId===book?.id&&p.chapterId===chapter?.id).map(p=>p.label+' · '+byId(p.sectionId).name).join(' / ')]));
   const coreRows=cores.map(n=>({node:n,count:displayEntries(rawNodes.filter(k=>k.type==='KNOWLEDGE'&&facets(k).includes(n.id)),rawNodes).length,rawCount:rawNodes.filter(k=>k.type==='KNOWLEDGE'&&facets(k).includes(n.id)).length}));
   return {thoughts:thoughtRows,selectedThought,thoughtMatches,cores:coreRows,books:bookRows,chapters:chapterRows,knowledge:knowledgeRows,methods:methodRows,additionalMethods,ideaLabels:ideaLabels,families:familyRows,knowledgeApplications,organizationGroups,placementLabels,links:activeLinks,
    selectedFacets,book,chapter,selectedKnowledge,selectedMethod,chapterCount:chapterKnowledge.length,totalKnowledge:knowledge.length,
    selection:{thoughtId:selectedThought?.id||null,bookId:book?.id||null,chapterId:chapter?.id||null,knowledgeId:selectedKnowledge?.id||null,methodId:selectedMethod?.id||null,query:selection.query||''}};
  }
  function locate(id,selection={}){
   id=displayId(id);const n=byId(id);if(!n)return selection;
   if(n.type==='TEXTBOOK')return {...selection,bookId:id,chapterId:null,knowledgeId:null,methodId:null,query:''};
   if(n.type==='CHAPTER')return {...selection,bookId:n.bookIds[0],chapterId:id,knowledgeId:null,methodId:null,query:''};
   if(n.type==='KNOWLEDGE'){
    const preferred=n.curriculumPlacements?.find(p=>p.role==='first_learning');
    const bookId=n.bookIds.includes(selection.bookId)?selection.bookId:preferred?.bookId||n.bookIds[0];
    const validChapters=n.chapterIds.filter(id=>byId(id)?.bookIds.includes(bookId));
    const chapterId=validChapters.includes(selection.chapterId)?selection.chapterId:(preferred?.bookId===bookId?preferred.chapterId:null)||validChapters[0];
    return {...selection,bookId,chapterId,knowledgeId:id,methodId:null,query:''};
   }
   return selection;
  }
  return {project,locate,byId,curriculumPaths,curriculumEdges};
 }
 const api={create,displayId,displayMembers,displayEntries};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HierarchyModel=api;
})(typeof window==='undefined'?{}:window);
