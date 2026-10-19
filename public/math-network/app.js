'use strict';
if (window.knowledgeNetworkFailed || !window.KnowledgePath?.validate(window.NETWORK).ok) { window.failKnowledgeNetwork(); throw new Error('Incomplete knowledge network'); }
document.getElementById('load-state').hidden=true;
const G=window.NETWORK,N=new Map(G.nodes.map(n=>[n.id,n])),byId=id=>N.get(id),$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mathText=value=>TextbookReader.text(value);
const TYPES={THOUGHT:'数学思想',THINKING_PROCESS:'思维过程',COMPETENCY:'核心素养',TEXTBOOK:'教材',REVIEW_COLLECTION:'专题复习',CHAPTER:'章节',SECTION:'课 / 节',LESSON:'课时',REVIEW:'复习节点',ACTIVITY:'建模活动',RESOURCE:'报告与资源',TOPIC:'知识主题',KNOWLEDGE:'知识点',METHOD:'解题方法',SKILL:'应用能力',METHOD_FAMILY:'方法家族'};
const displayType=n=>n.id==='kp:21169'?'抽样组织入口':TYPES[n.type];
const STATUS={provided_standard_explicit:'课标主题依据',source_record:'来源目录',source_asserted:'知识联系',source_flagged:'有争议 · 已停用',source_crosswalk:'标题定位',editorial_mapping:'编辑对应',editorial_proposal:'教学建议 · 本项目整理',editorial_review:'待辨析',design_navigation:'导航入口',inherited_tag:'主题继承标签',user_annotation:'我的标注'};
const S={mode:'all',scope:null,selected:null,related:true,lessons:true,methods:true,thoughts:true,facet:null,facets:[],bookFilter:null,depth:1,colorBy:'quiet',spacing:1,hideUnrelated:false,layout:'free'};let V=[],L=[],selectedEdges=new Set(),selectedNeighbors=new Set(),camera={x:0,y:0,k:1},width=900,height=700,frame=0,drag=null,hover=null;const P=new Map();
const ANNOTATION_KEY='math-knowledge-network-v01';let annotations={};try{annotations=JSON.parse(localStorage.getItem(ANNOTATION_KEY)||'{}')}catch{}
function facets(n){return annotations[n.id]?.competencyIds??n.competencyTagIds??n.competencyIds??[]}
function customTags(n){return annotations[n.id]?.tags??n.customTags??[]}
function refreshAnnotation(){ rebuild(); }
function saveAnnotation(id,patch){annotations[id]={...annotations[id],...patch,updatedAt:new Date().toISOString()};try{localStorage.setItem(ANNOTATION_KEY,JSON.stringify(annotations));refreshAnnotation();$('status-text').textContent='标签已保存在当前浏览器。'}catch{$('status-text').textContent='浏览器未能保存标签，请立即导出备份。'}}
let readerId=null,readerCaller=null,readerTrail=[];
let catalogExpansion={};
let hierarchySelection={bookId:null,chapterId:null,knowledgeId:null,methodId:null,query:''},hierarchyView=null;
const graphModeVisits=new Map();let graphModeAnimation=null;
const hierarchyModel=HierarchyModel.create(G,{facets,eligible:e=>e.active!==false&&e.status!=='source_flagged'});
function isHierarchy(){return S.layout==='layers'&&['overview','all','book','chapter','competency'].includes(S.mode);}
const canvas=$('graph'),ctx=canvas.getContext('2d'),wrap=$('graph-wrap');
const graphMathLayer=document.createElement('div');graphMathLayer.className='graph-math-labels';graphMathLayer.setAttribute('aria-hidden','true');wrap.append(graphMathLayer);const graphMathWidths=new Map(),graphMathIds=new Set(G.nodes.filter(n=>MathText.parts(n.name).some(p=>typeof p==='object')).map(n=>n.id));
const comps=G.nodes.filter(n=>n.type==='COMPETENCY'),books=G.nodes.filter(n=>['TEXTBOOK','REVIEW_COLLECTION'].includes(n.type));
// Read the same light-theme tokens as the DOM; fallbacks match the approved palette.
const CANVAS_TOKENS={bgSurface:'#F7FAFC',text:'#173B68',muted:'rgb(23 59 104 / .78)',border:'#9CC8EA',current:'#173B68',before:'#4F8FD7',method:'#173B68',neutral:'rgb(23 59 104 / .64)',competency:'#4F8FD7',curriculum:'#9CC8EA',knowledge:'#173B68',methodNode:'#79C2B5',skill:'#F1B57A'};
const CANVAS_TOKEN_NAMES={bgSurface:'bg-surface',text:'text',muted:'text-muted',border:'border-soft',current:'role-current',before:'edge-before',method:'edge-method',neutral:'edge-neutral',competency:'node-competency',curriculum:'node-curriculum',knowledge:'node-knowledge',methodNode:'node-method',skill:'node-skill'};
function canvasTheme(){const style=getComputedStyle(document.documentElement);return Object.fromEntries(Object.entries(CANVAS_TOKENS).map(([key,fallback])=>[key,style.getPropertyValue('--mn-'+CANVAS_TOKEN_NAMES[key]).trim()||fallback]));}
function color(n,theme=canvasTheme()){
 if(n.type==='COMPETENCY')return theme.competency;
 if(['METHOD','METHOD_FAMILY'].includes(n.type))return theme.methodNode;
 if(n.type==='SKILL')return theme.skill;
 if(['TEXTBOOK','CHAPTER','SECTION','LESSON','REVIEW_COLLECTION','REVIEW','ACTIVITY','RESOURCE'].includes(n.type))return theme.curriculum;
 return theme.knowledge;
}
function radius(n){return ({THOUGHT:13,THINKING_PROCESS:7,COMPETENCY:12,TEXTBOOK:11,REVIEW_COLLECTION:10,CHAPTER:7,TOPIC:7,METHOD:6,SKILL:5,METHOD_FAMILY:8})[n.type]||4}
const incident=new Map(G.nodes.map(n=>[n.id,[]]));for(const e of G.edges){incident.get(e.source)?.push(e);incident.get(e.target)?.push(e)}
function allowed(e){if(e.type==='PREREQUISITE_OF')return KnowledgePath.eligible(e);if(e.active===false||e.status==='source_flagged')return false;if(['RELATED_TO','PARALLEL_WITH','POSSIBLE_OVERLAP'].includes(e.type)&&!S.related)return false;return true}
function typeVisible(n){if(!S.thoughts&&['THOUGHT','THINKING_PROCESS'].includes(n.type))return false;if(!S.methods&&['METHOD','METHOD_FAMILY','SKILL'].includes(n.type))return false;if(!S.lessons&&['SECTION','LESSON','REVIEW'].includes(n.type))return false;return true}

const displayId=id=>HierarchyModel.displayId(id),displayRows=rows=>HierarchyModel.displayEntries(rows,G.nodes);
function displaySearch(rows){const found=new Map();for(const r of rows){const id=displayId(r.n.id),old=found.get(id);if(!old||r.rank<old.rank)found.set(id,{n:displayRows([r.n])[0],rank:r.rank});}return [...found.values()].sort((a,b)=>a.rank-b.rank||a.n.name.localeCompare(b.n.name,'zh-CN'));}
function choose(id,focus=false,origin='relation'){
 id=displayId(id);
 if(!N.has(id))return;
 const target=byId(id);
 if(focus&&!isReadableNode(target)){
  if(target.type==='TEXTBOOK')return setView('book',id,'directory');
  if(target.type==='CHAPTER')return setView('chapter',id,'directory');
  if(target.type==='COMPETENCY')return setView('competency',id,'directory');
 }
 if(focus&&isReadableNode(target)&&S.mode!=='path')return openReader(id,origin);
 rememberUI();closeSearch();
 const changed=S.selected!==id;
 if(origin==='search'||origin==='directory')startId=id;
 if(changed)nodeMotionId=id;
 S.selected=id;
 if(focus||S.mode==='path'){S.mode=isReadableNode(byId(id))?'path':'neighbors';S.scope=id;closeNotes(false);rebuild();}
 else{closeEdge(false);graphPinned=id;graphHover=null;origin==='graph'?closeNotes(false):openNotes();highlight();detail(id);assignUiKeys();draw();renderJourney();}
 closeCatalog(false);pushRoute();
}
function setView(mode,scope=null,origin='view'){
 scope=displayId(scope);
 rememberUI();readerId=null;readerTrail=[];releaseOverlay('reader');closeSearch();
 if(origin==='directory'&&N.has(scope))startId=scope;
 if(mode==='overview'){S.facet=null;S.facets=[];S.bookFilter=null;hierarchySelection={bookId:null,chapterId:null,knowledgeId:null,methodId:null,query:''};}
 if(mode==='book'||mode==='chapter')hierarchySelection=hierarchyModel.locate(scope,hierarchySelection);
 if(mode==='all'&&S.layout==='layers'&&byId(S.selected)?.type==='KNOWLEDGE')hierarchySelection=hierarchyModel.locate(S.selected,hierarchySelection);
 if(mode==='competency'){S.facet=scope;S.facets=[scope];}
 if(mode==='book')S.bookFilter=scope;
 graphPinned=null;graphHover=null;S.mode=mode;S.scope=scope;S.selected=scope;closeNotes(false);closeCatalog(false);rebuild();pushRoute();
}
function chainSet(id,direction='before'){const got=new Set([id]),queue=[id];while(queue.length){const u=queue.shift();for(const e of incident.get(u)||[]){if(!allowed(e)||e.type!=='PREREQUISITE_OF')continue;const v=direction==='before'&&e.target===u?e.source:direction==='after'&&e.source===u?e.target:null;if(v&&!got.has(v)){got.add(v);queue.push(v)}}}return got}
function rebuild(){const scopeKey=S.mode+'|'+S.scope; closeEdge(false); const same=renderedScope===scopeKey, ui=same?captureUI():null;let arr,keep;const scope=byId(S.scope);if(S.mode==='overview')arr=G.nodes.filter(n=>['COMPETENCY','TEXTBOOK','REVIEW_COLLECTION'].includes(n.type));
else if(S.mode==='book')arr=G.nodes.filter(n=>n.id===S.scope||n.bookIds.includes(S.scope)||n.type==='COMPETENCY');
else if(S.mode==='chapter')arr=G.nodes.filter(n=>n.id===S.scope||n.chapterIds.includes(S.scope)||scope.bookIds.includes(n.id));
else if(S.mode==='competency'){arr=G.nodes.filter(n=>S.facets.includes(n.id)||matchesFilters(n))}
else if(S.mode==='path')arr=S.scope?[byId(S.scope)]:[];
else if(['before','after'].includes(S.mode)){keep=chainSet(S.scope,S.mode);arr=G.nodes.filter(n=>keep.has(n.id))}
else if(S.mode==='neighbors'){keep=new Set([S.scope,...facets(byId(S.scope)),...hierarchyModel.curriculumPaths(S.scope).flatMap(p=>p.nodeIds)]);for(const e of incident.get(S.scope)||[])if(allowed(e))keep.add(e.source===S.scope?e.target:e.source);arr=G.nodes.filter(n=>keep.has(n.id))}
else arr=G.nodes.filter(n=>!['TOPIC','SECTION','LESSON','REVIEW','RESOURCE'].includes(n.type)||S.lessons);
if((S.facets.length||S.bookFilter)&&!['overview','neighbors','before','after','path'].includes(S.mode))arr=arr.filter(n=>n.id===S.scope||matchesFilters(n));V=displayRows(arr.filter(n=>typeVisible(n)||n.id===S.selected));let ids=new Set(V.map(n=>n.id));L=G.edges.filter(e=>allowed(e)&&ids.has(e.source)&&ids.has(e.target));if(!['overview','before','after','path'].includes(S.mode))L.push(...hierarchyModel.curriculumEdges(V));if(S.mode==='overview')L=L.filter(e=>['LEARNING_ENTRY','CONTAINS','CO_DEVELOPS','SUPPORTS'].includes(e.type));if(['before','after'].includes(S.mode))L=L.filter(e=>e.type==='PREREQUISITE_OF');
if(S.mode==='neighbors'){for(const cid of facets(byId(S.scope)))if(ids.has(cid)&&hasFacetBasis(byId(S.scope),cid)&&!L.some(e=>e.source===cid&&e.target===S.scope))L.push(facetEdge(byId(S.scope),cid,'tag'))}for(const cid of S.facets){if(!ids.has(cid))continue;for(const n of V)if(n.id!==cid&&facets(n).includes(cid)&&hasFacetBasis(n,cid)&&!L.some(e=>e.source===cid&&e.target===n.id))L.push(facetEdge(n,cid,'facet'));}const oldPositions=same?new Map(P):null;graphHover=null;graphFocusKey='';layout();if(!same){graphAlpha.clear();graphCameraMotion=null;}if(oldPositions)for(const [id,p] of P){const old=oldPositions.get(id);if(old){p.x=old.x;p.y=old.y;}}highlight();titles();detail(S.selected);renderBooks();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===S.mode));$('chain').classList.toggle('active',S.mode==='path');renderJourney();renderFilterSummary();resizeCanvas();if(!same&&S.mode!=='path')fit();assignUiKeys();renderedScope=scopeKey;if(ui)restoreUI(ui);else $('learning-path').scrollTop=0;draw()}
let graphPanel=null,graphPanelCaller=null,graphFocusMode=false;
let graphGroups=[],graphBands=[],graphLabels=[],graphLanes=new Map(),graphLocal=false,graphLayoutNarrow=null,graphPinned=null,graphHover=null,graphFocusKey='',graphFocusCache=null,graphAlpha=new Map(),graphMotionAt=0,graphLastFrame=0,graphCameraMotion=null;
const graphReduced=matchMedia('(prefers-reduced-motion: reduce)');
function graphFocus(){
 const selected=graphPinned||(S.selected&&(isLearningNode(byId(S.selected))||V.length<40)?S.selected:null),id=graphHover||selected;
 const key=(inspectedEdgeId||'')+'|'+id+'|'+V.length+'|'+L.length;
 if(key!==graphFocusKey){
  graphFocusKey=key;graphFocusCache=GraphDesign.focus(V,L,id);
  const visible=new Set(V.map(n=>n.id));
  for(const path of hierarchyModel.curriculumPaths(id)){
   const shown=path.nodeIds.filter(x=>visible.has(x));
   for(const x of shown)if(x!==id)graphFocusCache.roles.set(x,'curriculum');
   for(let i=1;i<shown.length;i++)for(const e of L)if(e.source===shown[i-1]&&e.target===shown[i]&&['CONTAINS','TEACHES','CURRICULUM_LOCATION'].includes(e.type))graphFocusCache.links.add(e.id);
  }

  if(inspectedEdgeId){const e=L.find(e=>e.id===inspectedEdgeId);if(e)graphFocusCache={id:e.source,roles:new Map([[e.source,'current'],[e.target,'after']]),links:new Set([e.id])};}
  graphMotionAt=performance.now();
 }
 return graphFocusCache;
}
const QUIET_COLORS={THOUGHT:'#9A754D',THINKING_PROCESS:'#7F8967',COMPETENCY:'#526F83',TEXTBOOK:'#788F9E',KNOWLEDGE:'#8093A2',METHOD:'#748F89',SKILL:'#7C918C'};
function graphNodeColor(n){return S.colorBy==='quiet'?QUIET_COLORS[GraphDesign.type(n)]:S.colorBy==='type'?GraphDesign.TYPES[GraphDesign.type(n)].color:GraphDesign.GROUPS[GraphDesign.group(n,byId)].color;}
function canSpaceGraph(){return !isHierarchy()&&!['path','neighbors','before','after'].includes(S.mode);}
function graphSpacing(){return canSpaceGraph()?S.spacing:1;}
function updateSpacingControl(){
 $('graph-spacing-control').hidden=!canSpaceGraph();$('graph-spacing').value=Math.round(S.spacing*100);const label=S.spacing.toFixed(2).replace(/0$/,'')+'×';$('graph-spacing-value').textContent=label;$('graph-spacing').setAttribute('aria-valuetext','节点间距 '+label);
}
function setGraphSpacing(value){
 if(!canSpaceGraph())return;
 const next=Math.min(2.2,Math.max(1,Number(value)||1)),ratio=next/S.spacing,anchor=P.get(S.selected),base=graphCameraMotion?.to||camera;
 graphCameraMotion=null;camera={...base};if(anchor){camera.x+=anchor.x*(1-ratio)*camera.k;camera.y+=anchor.y*(1-ratio)*camera.k;}
 for(const p of P.values()){p.x*=ratio;p.y*=ratio;}S.spacing=next;closeEdge(false);updateSpacingControl();draw();
}
function nodeVisual(n,f){return !f.id||f.roles.has(n.id)?1:S.hideUnrelated?0:.12;}
function edgeVisual(e,f){
 if(f.id)return f.links.has(e.id)?(e.type==='PREREQUISITE_OF'||inspectedEdgeId===e.id?1:['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)?.85:.38):S.hideUnrelated?0:.022;
 if(S.mode==='overview')return .23;
 if(graphLocal)return e.type==='PREREQUISITE_OF'?.6:['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)?.4:.12;
 if(S.colorBy==='quiet')return e.type==='PREREQUISITE_OF'?.12:['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)?.08:.025;
 return e.type==='PREREQUISITE_OF'?.2:['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)?.13:.055;
}
function layout(){
 if(isHierarchy()){P.clear();graphGroups=[];graphBands=[];graphLocal=false;graphLayoutNarrow=$('main').clientWidth<600;return;}
 const result=GraphDesign.layout(V,L,{byId,mode:S.mode,scope:S.scope,aspect:$('main').clientWidth<600?.8:wrap.clientWidth?wrap.clientWidth/Math.max(240,wrap.clientHeight):$('main').clientWidth/Math.max(240,$('main').clientHeight-130)});
 P.clear();for(const [id,p]of result.positions)P.set(id,{...p,x:p.x*graphSpacing(),y:p.y*graphSpacing(),vx:0,vy:0});graphGroups=result.groups;graphBands=result.bands||[];graphLocal=result.local;graphLayoutNarrow=$('main').clientWidth<600;graphLanes=GraphDesign.edgeLanes(L);graphFocusKey='';
}
function edgePoints(e){const a=P.get(e.source),b=P.get(e.target);if(!a||!b)return null;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,lane=graphLanes.get(e.id)||0,ox=-dy/d*lane,oy=dx/d*lane;return {a:{x:a.x*camera.k+camera.x+ox,y:a.y*camera.k+camera.y+oy},b:{x:b.x*camera.k+camera.x+ox,y:b.y*camera.k+camera.y+oy}};}
function moveCamera(to,animate=false){
 if(!animate||graphReduced.matches||inputKind==='keyboard'){camera=to;graphCameraMotion=null;}
 else graphCameraMotion={from:{...camera},to,start:performance.now()};draw();
}
function fit(animate=false){if(!P.size)return;const spacing=graphSpacing(),pts=[...P.values()].map(p=>({x:p.x/spacing,y:p.y/spacing})),minX=Math.min(...pts.map(p=>p.x))-95,maxX=Math.max(...pts.map(p=>p.x))+95,minY=Math.min(...pts.map(p=>p.y))-100,maxY=Math.max(...pts.map(p=>p.y))+90,k=Math.max(.08,Math.min(1.35,(width-80)/(maxX-minX),(height-65)/(maxY-minY)));moveCamera({k,x:width/2-(minX+maxX)/2*k,y:height/2-(minY+maxY)/2*k},animate)}
function graphShape(n,x,y,r){
 const shape=GraphDesign.TYPES[GraphDesign.type(n)].shape;ctx.beginPath();
 if(shape==='circle')ctx.arc(x,y,r,0,Math.PI*2);
 else if(shape==='square')ctx.roundRect(x-r,y-r,r*2,r*2,Math.min(3,r/2));
 else{const sides=shape==='triangle'?3:shape==='diamond'?4:6;for(let i=0;i<sides;i++){const a=-Math.PI/2+i*Math.PI*2/sides;i?ctx.lineTo(x+Math.cos(a)*r*1.18,y+Math.sin(a)*r*1.18):ctx.moveTo(x+Math.cos(a)*r*1.18,y+Math.sin(a)*r*1.18);}ctx.closePath();}
}
function graphRadius(n){if(S.colorBy==='quiet'&&!graphLocal)return Math.max(['SECTION','LESSON'].includes(n.type)?1.5:2,Math.min(8,radius(n)*Math.sqrt(camera.k)*.8));return Math.max(3.1,Math.min(11,radius(n)*Math.sqrt(camera.k)));}
function updateGraphControls(){
 updateSpacingControl();
 const layered=isHierarchy(),local=['neighbors','before','after'].includes(S.mode);
 $('graph-global').hidden=!local;
 $('graph-mode-name').textContent=layered?'分层图谱':local?'局部关系图':'全景网络';
 $('graph-mode-description').textContent=layered?'素养 → 教材 → 章节 → 知识 → 方法 · 思想横向联系':local?(byId(S.scope)?.type==='THOUGHT'?'跨知识点与方法，查看思想联系':'围绕当前知识，查看前置与后续'):'看见整张网，选一个节点探索';
 const label=layered?'切换到全景网络':'切换到分层图谱';
 $('graph-layout-toggle').setAttribute('aria-label',label);$('graph-layout-toggle').querySelector('span').textContent=label;
 const n=byId(graphFocus().id),ready=n&&isLearningNode(n),scope=byId(S.scope),filters=S.facets.length+Number(!!S.bookFilter);
 $('graph-focus-title').innerHTML=mathText(n?n.name:scope?.name||(S.mode==='overview'?'从六大素养出发':S.facets.length===1?byId(S.facets[0]).name+' · 知识网络':'全课程知识网络'));
 $('graph-focus-title').title=$('graph-focus-title').textContent;
 $('graph-subtitle').textContent=n?displayType(n)+(n.bookIds?.length?' · '+n.bookIds.map(id=>byId(id)?.name).join(' / '):''):`${V.length} 个节点 · ${L.length} 条联系`+(S.facets.length?' · '+S.facets.map(id=>byId(id).name).join('、'):'');
 $('graph-selection-controls').hidden=!n;
 $('graph-local').disabled=!ready;$('graph-local').textContent=n?.type==='THOUGHT'?'思想联系':'聚焦前后置';$('graph-read').disabled=!(ready||!!(n?.type==='COMPETENCY'&&window.R80_PRESENTATION_DATA?.competencyGuidesByNode?.[n.id]));$('graph-read').textContent=n?.type==='COMPETENCY'&&window.R80_PRESENTATION_DATA?.competencyGuidesByNode?.[n.id]?'素养说明':n?.type==='THOUGHT'?'思想详解':'知识详解';$('graph-clear').disabled=!n;
 $('graph-isolate').disabled=!n;$('graph-isolate').setAttribute('aria-pressed',S.hideUnrelated);$('graph-color').value=S.colorBy;
 $('graph-relation-count').textContent=n?L.filter(e=>e.source===n.id||e.target===n.id).length:'';
 $('graph-back').disabled=routeIndex===0;$('graph-filter-count').hidden=!filters;$('graph-filter-count').textContent=filters;
 const byType=S.colorBy!=='domain',types=[...new Set(V.map(n=>byType?GraphDesign.type(n):GraphDesign.group(n,byId)))],palette=S.colorBy==='quiet'?Object.fromEntries(Object.entries(GraphDesign.TYPES).map(([key,item])=>[key,{...item,color:QUIET_COLORS[key]}])):byType?GraphDesign.TYPES:GraphDesign.GROUPS;
 $('graph-key').innerHTML=types.map(k=>`<span><i style="--key-color:${palette[k].color}"></i>${palette[k].label}</span>`).join('')+'<small>圆点 知识 · 三角形 思想 · 菱形 方法/过程 · 六边形 素养</small>';
 if(isHierarchy())$('graph-key').innerHTML=[['#9A527D','核心素养'],['#527DB5','教材'],['#478B85','章节'],['#B18343','知识点'],['#8263AA','解题方法'],['#A86B30','数学思想']].map(([c,t])=>`<span><i style="--key-color:${c}"></i>${t}</span>`).join('')+'<small>曲线表示分类、所属或方法联系。方法实线：解题可用；虚线：使用知识。前后置关系在局部图中查看。</small>';
 $('graph-focus-help').textContent=n?.type==='THOUGHT'?'棕色连线表示思想联系 · 点线查看依据':ready?'蓝灰：教材目录　橙色：前置　青绿：后续　紫色：方法':'悬停看联系 · 点击锁定 · 双击展开';
}
function closeGraphPanel(restore=true){
 const was=graphPanel;for(const name of ['scope','display','relations']){$('graph-'+name+'-panel').hidden=true;$('graph-'+name+'-toggle').setAttribute('aria-expanded','false');}graphPanel=null;releaseOverlay('graph-panel');
 if(was&&restore&&graphPanelCaller?.getClientRects().length)graphPanelCaller.focus({preventScroll:true});
}
function toggleGraphPanel(name){
 if(graphPanel===name){closeGraphPanel();return;}
 closeGraphPanel(false);closeEdge(false);graphPanelCaller=$('graph-'+name+'-toggle');graphPanel=name;$('graph-'+name+'-panel').hidden=false;graphPanelCaller.setAttribute('aria-expanded','true');
 if(name==='relations')$('graph-relations').open=true;activateOverlay('graph-panel');$('graph-'+name+'-panel').querySelector('[data-graph-panel-close]').focus({preventScroll:true});
}
function setGraphFocusMode(value,refit=true){
 const next=!!value&&S.mode!=='path';if(next!==graphFocusMode)closeGraphPanel(false);graphFocusMode=next;if(graphFocusMode){closeCatalog(false);closeNotes(false);}
 document.body.classList.toggle('graph-focus-mode',graphFocusMode);const b=$('graph-focus-toggle');b.setAttribute('aria-pressed',graphFocusMode);b.setAttribute('aria-label',graphFocusMode?'退出专注图谱':'专注图谱');b.querySelector('span').textContent=graphFocusMode?'退出专注':'专注图谱';
 if(refit&&S.mode!=='path'){graphCameraMotion=null;resizeCanvas();if(isHierarchy())hierarchyView?.refresh();else fit(true);}
}
function toggleCatalogLayout(){
 const app=document.querySelector('.app'),collapsed=app.classList.toggle('catalog-collapsed');$('catalog-layout-toggle').setAttribute('aria-expanded',!collapsed);$('catalog-layout-toggle').setAttribute('aria-label',collapsed?'展开教材目录':'收起教材目录');resizeCanvas();if(S.mode!=='path')fit(true);
}

function highlight(){selectedNeighbors=new Set();selectedEdges=new Set();if(S.selected)for(let e of L)if(e.source===S.selected||e.target===S.selected){selectedEdges.add(e.id);selectedNeighbors.add(e.source);selectedNeighbors.add(e.target)}}
function titles(){let title='从素养出发，看见数学的联系',crumb='全课程 · 素养 → 教材 → 章节';const n=byId(S.scope);if(n){title=n.name;crumb=({book:'教材展开',chapter:'章节知识网络',competency:'素养视角 · 主题目标与方法联系',path:'学习路径 · 前置 → 当前 → 后续',neighbors:'一跳关系 · 可继续双击探索',before:'前置知识链 · 箭头由准备知识指向后续',after:'后续知识链 · 箭头由准备知识指向后续'})[S.mode]||'知识网络'}else if(S.mode==='all'){title='全课程知识网络';crumb='全局视图 · 点击节点，再展开局部'}$('view-title').innerHTML=mathText(title);$('breadcrumb').textContent=crumb+(S.facets.length?' · 素养筛选：'+S.facets.map(id=>byId(id).name).join('、'):'');$('view-count').innerHTML=`${V.length} 节点<br>${L.length} 条关系`;$('status-text').textContent='沿前置准备与后续知识探索，展开联系可查看依据。'}
function draw(){if(!frame)frame=requestAnimationFrame(paint)}
function paint(now){
 frame=0;if(S.mode==='path'||isHierarchy()||!wrap.clientWidth)return;
 const theme={...canvasTheme(),bgSurface:'#FBFCFD'},f=graphFocus(),instant=graphReduced.matches||inputKind==='keyboard',elapsed=now-graphMotionAt,dt=Math.min(40,Math.max(1,now-(graphLastFrame||now-16))),rate=instant||elapsed>240?1:1-Math.exp(-dt/48);graphLastFrame=now;
 let moving=false;
 if(graphCameraMotion){const {from,to,start}=graphCameraMotion,t=Math.min(1,(now-start)/180),ease=1-(1-t)**3;for(const key of ['x','y','k'])camera[key]=from[key]+(to[key]-from[key])*ease;if(t===1)graphCameraMotion=null;else moving=true;}
 const alpha=(key,target)=>{const previous=graphAlpha.get(key)??target,value=Math.abs(previous-target)<.006?target:previous+(target-previous)*rate;graphAlpha.set(key,value);if(Math.abs(value-target)>.006)moving=true;return value;};
 const screen=p=>({x:p.x*camera.k+camera.x,y:p.y*camera.k+camera.y});
 ctx.globalAlpha=1;ctx.clearRect(0,0,width,height);ctx.fillStyle=theme.bgSurface;ctx.fillRect(0,0,width,height);
 const graphRect=canvas.getBoundingClientRect(),reserved=[...wrap.querySelectorAll('.graph-help,.zoom,#graph-selection-controls:not([hidden]),#edge-inspector:not([hidden])')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {x:r.left-graphRect.left-5,y:r.top-graphRect.top-5,w:r.width+10,h:r.height+10};});
 // Labels identify presentation layers; they add no graph edges.
 for(const band of graphBands){const y=band.y*camera.k+camera.y;if(y<25||y>height-70)continue;ctx.globalAlpha=1;ctx.font='500 11px -apple-system,"PingFang SC",sans-serif';ctx.textAlign='left';ctx.fillStyle='#6B7D8D';ctx.fillText(band.label,22,y);reserved.push({x:18,y:y-14,w:ctx.measureText(band.label).width+12,h:20});}
 // Soft clusters establish location without adding fictitious relationships.
 for(const g of graphGroups){const pos=screen(g),r=g.r*camera.k+22,rx=(g.rx||g.r)*camera.k+22,c=GraphDesign.GROUPS[g.key].color;ctx.globalAlpha=f.id?.12:.38;const grad=ctx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y,r);grad.addColorStop(0,c+'15');grad.addColorStop(1,c+'00');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(pos.x,pos.y,rx,r,0,0,Math.PI*2);ctx.fill();
  if(!f.id){const text=GraphDesign.GROUPS[g.key].label+' · '+g.count,x=pos.x,y=pos.y-r-6;ctx.globalAlpha=.85;ctx.font='600 12px -apple-system,"PingFang SC",sans-serif';ctx.textAlign='center';ctx.fillStyle=c;ctx.fillText(text,x,y);reserved.push({x:x-80,y:y-15,w:160,h:22});}}
 const lines=[...L].sort((a,b)=>Number(f.links.has(a.id))-Number(f.links.has(b.id)));
 for(const e of lines){const ap=P.get(e.source),bp=P.get(e.target);if(!ap||!bp)continue;const {a,b}=edgePoints(e),active=f.links.has(e.id),pre=e.type==='PREREQUISITE_OF',idea=['ILLUSTRATES_THOUGHT','GUIDES_METHOD','USES_PROCESS','EXPLORES_KNOWLEDGE'].includes(e.type),met=['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type),opacity=alpha('e:'+e.id,edgeVisual(e,f));if(opacity<.008)continue;
  const tint=pre?(active&&f.id?(e.target===f.id?'#AF621C':'#167E71'):'#7093B3'):idea?'#A86B30':met?'#8556AD':'#94A3B5';ctx.globalAlpha=opacity;ctx.strokeStyle=tint;ctx.lineWidth=active?pre?2:1.5:.8;ctx.setLineDash(['RELATED_TO','PARALLEL_WITH','POSSIBLE_OVERLAP','CURRICULUM_LOCATION'].includes(e.type)?[3,5]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
  if(pre&&(active||graphLocal)){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,r=graphRadius(bp.n)+4,x=b.x-dx/d*r,y=b.y-dy/d*r,len=7;ctx.fillStyle=tint;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx/d*len-dy/d*3,y-dy/d*len+dx/d*3);ctx.lineTo(x-dx/d*len+dy/d*3,y-dy/d*len-dx/d*3);ctx.closePath();ctx.fill();}}
 const candidates=[],nodes=[...V].sort((a,b)=>Number(f.roles.has(a.id))-Number(f.roles.has(b.id)));
 for(const n of nodes){const p=P.get(n.id);if(!p)continue;const pos=screen(p),role=f.roles.get(n.id),selected=n.id===f.id,opacity=alpha('n:'+n.id,nodeVisual(n,f));if(opacity<.008)continue;const r=selected?Math.max(10,graphRadius(n)+3):graphRadius(n),c=graphNodeColor(n);ctx.globalAlpha=opacity;
  if(role&&f.id){ctx.strokeStyle=({before:'#AF621C',after:'#167E71',method:'#8556AD',thought:'#A86B30',current:'#173B68',context:'#94A3B5',curriculum:'#527DB5'})[role];ctx.lineWidth=selected?2:1.4;ctx.beginPath();ctx.arc(pos.x,pos.y,r+4,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle=c;graphShape(n,pos.x,pos.y,r);ctx.fill();ctx.strokeStyle=theme.bgSurface;ctx.lineWidth=S.colorBy==='quiet'&&!role ? .35 : 1.3;ctx.stroke();
  const want=!f.id||!!role;if(!want||pos.x<8||pos.x>width-8||pos.y<8||pos.y>height-8)continue;
  const mathLabel=graphMathIds.has(n.id),multiline=!mathLabel&&graphLocal&&(n.type==='TOPIC'||selected)&&n.name.length>18,lines=multiline?(n.name.match(/.{1,20}/gu)||[n.name]):[n.name.length>18&&!selected&&!mathLabel?n.name.slice(0,18)+'…':n.name],text=lines.join(''),font=selected?'600 16px':graphLocal?'500 13px':'500 12px';ctx.font=font+' -apple-system,"PingFang SC",sans-serif';
  let mathWidth=0;if(mathLabel){const key=font+'|'+n.id;if(!graphMathWidths.has(key)){const el=document.createElement('span');el.className='graph-math-label';el.style.font=font+' -apple-system,"PingFang SC",sans-serif';el.innerHTML=mathText(n.name);graphMathLayer.append(el);graphMathWidths.set(key,el.getBoundingClientRect().width+4);el.remove();}mathWidth=graphMathWidths.get(key);}
  const priority=selected?1000:role==='curriculum'?900:['before','after'].includes(role)?800:role==='method'?600:n.type==='THOUGHT'?500:['COMPETENCY','TEXTBOOK','CHAPTER'].includes(n.type)?300:100;
  candidates.push({id:n.id,text,lines,font,priority,x:pos.x,y:pos.y+r+7,w:mathWidth||Math.max(...lines.map(t=>ctx.measureText(t).width))+12,h:lines.length>1?lines.length*20+6:graphLocal?25:22,opacity,anchorX:pos.x,anchorY:pos.y,offsets:[0,-r*2-29,26,-r*2-55]});
 }
 const limit=f.id?36:V.length<35?35:Math.min(30,6+Math.floor(camera.k*25));
 const labels=GraphDesign.placeLabels(candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)),{width,height,limit,reserved});
 graphLabels=labels;graphMathLayer.innerHTML=labels.filter(l=>graphMathIds.has(l.id)).map(l=>'<span class="graph-math-label" data-graph-math-node="'+esc(l.id)+'" style="left:'+l.x+'px;top:'+l.y+'px;width:'+l.w+'px;opacity:'+l.opacity+';font:'+l.font+' -apple-system,PingFang SC,sans-serif">'+mathText(byId(l.id).name)+'</span>').join('');
 for(const label of labels){ctx.globalAlpha=label.opacity;if(Math.abs(label.y-label.anchorY)>30||Math.abs(label.x+label.w/2-label.anchorX)>18){ctx.strokeStyle=graphNodeColor(byId(label.id));ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(label.anchorX,label.anchorY);ctx.lineTo(label.x+label.w/2,label.y+(label.y<label.anchorY?label.h:0));ctx.stroke();}ctx.fillStyle=theme.bgSurface;ctx.beginPath();ctx.roundRect(label.x,label.y,label.w,label.h,5);ctx.fill();ctx.font=label.font+' -apple-system,"PingFang SC",sans-serif';ctx.fillStyle=theme.text;ctx.textAlign='center';ctx.textBaseline='middle';if(!graphMathIds.has(label.id))(label.lines||[label.text]).forEach((line,i,lines)=>ctx.fillText(line,label.x+label.w/2,label.y+label.h/2+(i-(lines.length-1)/2)*20));}
 ctx.textBaseline='alphabetic';ctx.globalAlpha=1;
 // Readable render telemetry lives on the canvas alongside its accessibility description.
 canvas.dataset.drawnLabels=labels.length;canvas.dataset.focusNode=f.id||'';canvas.dataset.contextNodes=V.filter(n=>nodeVisual(n,f)<1).length;canvas.dataset.motion=moving?'running':'settled';
 if(moving)draw();
}
function summary(){S.selected=null;$('detail').innerHTML=`<span class="type-badge">知识网络 · 当前版</span><h2>同一份数学，<br>多种学习路径。</h2><p>以六大核心素养为入口，沿教材与章节展开知识，再进入解题方法与应用能力。</p><div class="stats-grid"><div><b>518</b><small>有阅读内容的知识与方法</small></div><div><b>59</b><small>有内容的解题方法</small></div><div><b>${G.metadata.counts.activeCourseRows}</b><small>保留的课程目录节点</small></div><div><b>24</b><small>课标内容主题核对</small></div></div><h3>开始探索</h3><p>选择左侧的一本教材，或搜索“基本不等式”“二分法”“数列”。点击节点查看依据，双击展开局部网络。</p><div class="warning">主题层面与教材、课标匹配。新增方法映射与先修关系保留“教学建议”状态，可在此基础上继续逐点细化。</div><h3>关系的含义</h3><p>聚焦时橙色箭头：前置准备；青绿箭头：后续知识。<br>紫色联系：知识与方法的使用关系。<br>细线：层级、导航或一般关联。</p><a href="review/standard-review.html" target="_blank">查看课标核对记录 ↗</a>`;highlight();draw()}
function relationList(title,edges,getOther){if(!edges.length)return '';return `<h3>${title}<span>${edges.length}</span></h3>`+edges.map(e=>{const id=getOther(e),n=byId(id),role=e.type==='PREREQUISITE_OF'?(e.source===id?'before':'after'):['USES_KNOWLEDGE','SOLVED_BY'].includes(e.type)?'method':'associated';if(!n)return '';return `<div class="relation" tabindex="0" role="button" data-node="${id}" data-node-type="${n.type}" data-path-role="${role}" data-evidence-status="${e.status}" title="${esc(e.rationale||e.review?.reason||'')}"><span>${mathText(n.name)}<em>${esc(RELATIONS[e.type])} · ${esc(evidenceStatus(e))}</em></span><small>↗</small></div>`;}).join('');}
function nodeDescription(n){if(n.type==='THOUGHT')return n.description;return window.TextbookReader?.description(n.id)||window.READER_CONTENT?.[n.id]?.description||(!/原平台|原网站|mathtrek/i.test(n.description||'')&&n.description)||'此条目的释义尚待整理，可先查看教材位置与已记录联系。';}
function readerRequirements(n){
 const exact=window.READING_DATA?.requirements?.byNodeId?.[n.id],legacy=window.R80_PRESENTATION_DATA?.legacyTopicRequirements||{};
 const inherited=[...(n.topicIds||[]),n.type==='TOPIC'?n.id:null].filter(Boolean).map(id=>legacy[id]).filter(Boolean);
 const direct=exact?[{...exact,level:exact.previousTopicLevel?.value||(!/待按|待核|待对应/.test(exact.level||'')?exact.level:''),status:exact.previousTopicLevel?.status||exact.levelStatus||'unresolved'}]:[n].filter(x=>x.sourceData?.['原要求动词']||x.sourceData?.['要求动词']||x.assessmentTags?.academic_quality_level?.sourceLabel).map(x=>({verbs:x.sourceData?.['原要求动词']||x.sourceData?.['要求动词']||'',level:x.assessmentTags?.academic_quality_level?.sourceLabel||'',scope:x.name,sourceTitle:x.name,referenceScope:'entry',status:x.assessmentTags?.academic_quality_level?.status||'source_rule_unverified',quote:x.sourceData?.['教学目标']||''}));
 const records=[...inherited,...direct.filter(r=>!exact?.levelSourceNodeId||!inherited.some(x=>x.sourceNodeId===exact.levelSourceNodeId))].filter((r,i,a)=>a.findIndex(x=>x.level===r.level&&x.scope===r.scope)===i);
 return window.R80Reader?.requirements(n.id,records)||'<section class="reader-requirements"><h3>知识要求与考核水平</h3><p>来源正在读取。</p></section>';
}
function detail(id,supportOnly=false){if(!id){summary();return}const n=byId(id);if(!n)return;const es=incident.get(id)||[],prev=es.filter(e=>e.type==='PREREQUISITE_OF'&&e.target===id&&allowed(e)),next=es.filter(e=>e.type==='PREREQUISITE_OF'&&e.source===id&&allowed(e)),solutions=es.filter(e=>e.type==='SOLVED_BY'&&allowed(e)),uses=es.filter(e=>e.type==='USES_KNOWLEDGE'&&allowed(e)),parents=es.filter(e=>['CONTAINS','INCLUDES_METHOD','TEACHES','SPECIALIZES_TO'].includes(e.type)&&e.target===id),children=es.filter(e=>['CONTAINS','INCLUDES_METHOD','SPECIALIZES_TO'].includes(e.type)&&e.source===id),related=es.filter(e=>['RELATED_TO','PARALLEL_WITH','SUPPORTS','POSSIBLE_OVERLAP'].includes(e.type)&&allowed(e));
let html=supportOnly?'':`<span class="type-badge" data-node-type="${n.type}">${esc(displayType(n)||n.type)}</span><h2>${mathText(n.name)}</h2>`;
if(!supportOnly){html+=textbookLocation(n,'notes');html+=customTags(n).map(t=>`<span class="tag custom-tag"># ${esc(t)}</span>`).join('');html+=`<p>${TextbookReader.text(nodeDescription(n))}</p><div class="path-tags" aria-label="素养关联">${competencyBadges(n,'notes')}</div><div class="detail-actions"><button data-explore="${id}">聚焦前后置</button></div>`;}
html+=`<details class="tag-editor"><summary>我的素养分类与标记</summary><h3>素养分类 <span>点击可多选</span></h3><div class="competency-tags">${comps.map(c=>`<button data-tag-comp="${c.id}" title="${annotations[id]?.competencyIds?'我的标注':n.competencyFacets?.find(f=>f.id===c.id)?.scope||'未自动关联；可按具体任务补充'}" class="${facets(n).includes(c.id)?'selected':''}" aria-pressed="${facets(n).includes(c.id)}">${mathText(c.name)}</button>`).join('')}</div><p class="annotation-note">${annotations[id]?.competencyIds?'使用我的分类，仅保存在当前浏览器。':'可调整自己的分类，不改变平台知识内容。'} <button class="text-button" id="restore-tags">恢复默认</button></p><div class="add-tag"><input value="${esc(drafts[id]||'')}" id="custom-tag-input" placeholder="添加自定义标签，如：易错点" aria-label="自定义标签"><button id="add-tag">＋</button></div><div class="editable-tags">${customTags(n).map((t,i)=>`<button data-remove-tag="${i}" title="移除此标签">${esc(t)} ×</button>`).join('')}</div>`;
html+='</details>';
if(!supportOnly&&n.chapterIds.length)html+=`<h3>所属知识单元</h3>${n.chapterIds.map(ch=>`<div class="relation" tabindex="0" role="button" data-node="${ch}"><span>${esc(byId(ch).name)}<em>${esc(byId(ch).bookIds.map(b=>byId(b).name).join(' / '))}</em></span><small>↗</small></div>`).join('')}`;
if(n.tags['提供课标范围'])html+=`<div class="warning">所提供课标：${mathText(n.tags['提供课标范围'])}。地方教学与考查要求另行核对。</div>`;
if(n.occurrenceNotes?.length)html+=`<p>此条目出现在教材标星节中。星号是该出现位置的标签，不能直接推定所有应用都属选学。</p>`;
if(!supportOnly&&!TextbookReader.articles(id).length&&n.steps?.length)html+=`<h3>方法步骤 <span>编辑整理</span></h3>${n.steps.map((s,i)=>`<div class="step"><b>${i+1}</b><span>${mathText(s)}</span></div>`).join('')}`;
if(!supportOnly&&!TextbookReader.articles(id).length&&n.tags['适用条件'])html+=`<div class="warning">${mathText(n.tags['适用条件'])}</div>`;
if(!supportOnly){html+=relationList('所属主题 / 出现位置',parents,e=>e.source);html+=relationList('继续向下展开',children,e=>e.target);}if(!supportOnly){html+=relationList('前置知识',prev,e=>e.source);html+=relationList('后续知识',next,e=>e.target);html+=relationList(n.type==='METHOD'?'可用于这些知识与任务':'可调用的方法',solutions,e=>e.source===id?e.target:e.source);html+=relationList(n.type==='METHOD'?'实施时用到的知识':'哪些方法使用它',uses,e=>e.source===id?e.target:e.source);
html+=relationList('横向联系',related,e=>e.source===id?e.target:e.source);}
if(!supportOnly)html+=TextbookReader.render(id);
if(n.standardReferences?.length)html+=`<h3>课标依据</h3>${n.standardReferences.map(r=>{let a=r.anchor||r;return `<details class="evidence"><summary>${esc(r.name||'课标原文')} ${a.printedPages?' / 正文'+esc(a.printedPages.join('–'))+'页':''}</summary>${r.summary?`<p>${mathText(r.summary)}</p>`:''}<p>${mathText(r.notes||'主题整体对应，不代表已逐点核定要求。')}</p><pre>${mathText(a.excerpt||'')}</pre></details>`}).join('')}`;
const tags=Object.entries(n.tags||{}).filter(([k])=>!['旧启发式分数','starred_occurrence','适用条件'].includes(k));if(tags.length)html+=`<details><summary>范围、水平与评价标签</summary>${tags.map(([k,v])=>`<div class="kv"><strong>${esc(k)}</strong>${k==='原平台年级学期'?esc(typeof v==='object'?JSON.stringify(v):v):mathText(typeof v==='object'?JSON.stringify(v):v)}</div>`).join('')}<p>水平标签不参与图谱层级，也不代表学生已达到相应水平。</p></details>`;
const evid=TextbookReader.articles(id).length?[]:n.methodEvidence||[];if(evid.length)html+=`<h3>方法材料出处</h3>${evid.map(e=>`<details class="evidence"><summary>${esc(e.sourceId||'材料')} · L${e.lineStart}–${e.lineEnd}</summary><p>${esc(e.path)}</p><p>${mathText(e.excerpt)}</p><small>材料支持方法或背景；步骤与点位对应由编辑整理。</small></details>`).join('')}`;
$('detail').dataset.currentNode=id;$('detail').innerHTML=html;$('detail').scrollTop=0;document.querySelectorAll('[data-tag-comp]').forEach(b=>b.onclick=()=>{let a=facets(n).slice(),c=b.dataset.tagComp;saveAnnotation(id,{competencyIds:a.includes(c)?a.filter(x=>x!==c):[...a,c]})});$('restore-tags').onclick=()=>{if(annotations[id]){delete annotations[id].competencyIds;localStorage.setItem(ANNOTATION_KEY,JSON.stringify(annotations));refreshAnnotation()}};$('custom-tag-input').oninput=e=>{drafts[id]=e.target.value;};const addTag=()=>{const value=$('custom-tag-input').value.trim().slice(0,40);if(value&&!customTags(n).includes(value)){delete drafts[id];$('custom-tag-input').value='';saveAnnotation(id,{tags:[...customTags(n),value]})}};$('add-tag').onclick=addTag;$('custom-tag-input').onkeydown=e=>{if(e.key==='Enter')addTag()};document.querySelectorAll('[data-remove-tag]').forEach(b=>b.onclick=()=>saveAnnotation(id,{tags:customTags(n).filter((_,i)=>i!==Number(b.dataset.removeTag))}));document.querySelectorAll('[data-node]').forEach(b=>{b.onclick=()=>choose(b.dataset.node,true);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(b.dataset.node,true)}}});document.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>{setView('neighbors',b.dataset.explore);openNotes()});document.querySelectorAll('[data-before]').forEach(b=>b.onclick=()=>setView('before',b.dataset.before));document.querySelectorAll('[data-after]').forEach(b=>b.onclick=()=>setView('after',b.dataset.after))}
function hit(x,y){let best=null,dmin=18;const f=graphFocus();for(const label of graphLabels)if(x>=label.x&&x<=label.x+label.w&&y>=label.y-3&&y<=label.y+label.h+3&&nodeVisual(byId(label.id),f)>0)return P.get(label.id);for(const p of P.values()){if(nodeVisual(p.n,f)===0)continue;let d=Math.hypot(p.x*camera.k+camera.x-x,p.y*camera.k+camera.y-y);if(d<Math.max(10,graphRadius(p.n)+4)&&d<dmin){best=p;dmin=d}}return best}
canvas.onpointerdown=e=>{if(drag)return;graphCameraMotion=null;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,p=hit(x,y);drag={p,x,y,originX:x,originY:y,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';$('tooltip').hidden=true};
canvas.onpointermove=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(drag){let dx=x-drag.x,dy=y-drag.y;if(Math.hypot(x-drag.originX,y-drag.originY)>3)drag.moved=true;if(drag.p){drag.p.x+=dx/camera.k;drag.p.y+=dy/camera.k}else{camera.x+=dx;camera.y+=dy}drag.x=x;drag.y=y;draw()}else{let p=hit(x,y);canvas.style.cursor=p?'pointer':'grab';const next=e.pointerType==='mouse'&&matchMedia('(hover:hover)').matches?p?.n.id:null;if(graphHover!==next){graphHover=next;graphMotionAt=performance.now();draw();}if(p){$('tooltip').hidden=false;$('tooltip').innerHTML=mathText(p.n.name)+' · '+esc(TYPES[p.n.type]);$('tooltip').style.left=Math.max(8,Math.min(x+14,width-270))+'px';$('tooltip').style.top=Math.max(5,y-40)+'px'}else $('tooltip').hidden=true}};
canvas.onpointerup=e=>{if(drag&&!drag.moved){if(drag.p)choose(drag.p.n.id,false,'graph');else{const edge=hitEdge(drag.x,drag.y);if(edge)showEdge(edge,canvas);else{closeEdge(false);S.selected=null;graphPinned=null;graphHover=null;summary();updateGraphControls();renderGraphRelations();pushRoute(true);}}}drag=null;canvas.style.cursor='grab';rememberUI()};canvas.onpointercancel=()=>{drag=null};canvas.ondblclick=e=>{const r=canvas.getBoundingClientRect(),p=hit(e.clientX-r.left,e.clientY-r.top);if(!p)return;let n=p.n;if(['TEXTBOOK','REVIEW_COLLECTION'].includes(n.type))setView('book',n.id);else if(n.type==='CHAPTER')setView('chapter',n.id);else if(n.type==='COMPETENCY')setView('competency',n.id);else setView('neighbors',n.id)};
function zoom(f,x=width/2,y=height/2){const base=graphCameraMotion?.to||camera,k=Math.max(.07,Math.min(5,base.k*f)),ratio=k/base.k;moveCamera({x:x-(x-base.x)*ratio,y:y-(y-base.y)*ratio,k},true)}
canvas.onwheel=e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top)};canvas.onpointerleave=()=>{$('tooltip').hidden=true;if(graphHover){graphHover=null;draw();}};
function resizeCanvas(){
 if(!wrap.clientWidth||!wrap.clientHeight)return;
 const ow=width,oh=height;width=wrap.clientWidth;height=wrap.clientHeight;
 const dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
 camera.x+=(width-ow)/2;camera.y+=(height-oh)/2;
}
new ResizeObserver(()=>{resizeCanvas();if(S.mode!=='path'&&graphLocal&&graphLayoutNarrow!==($('main').clientWidth<600)){layout();fit();}draw()}).observe(wrap);

// Reading state belongs to a history entry; teaching annotations belong to a node.
const pathModel=KnowledgePath.create(G.nodes,G.edges);
const drafts={}, visits=new Map();
let renderedScope=null, routeIndex=history.state?.mathNetwork?history.state.index:0;
let entryKey=history.state?.entryKey||crypto.randomUUID(), applyingRoute=false;
let startId=history.state?.startId||null, inputKind='pointer', notesCaller=null, catalogCaller=null, edgeCaller=null, inspectedEdgeId=null, nodeMotionId=null;
const overlayStack=[];
function activateOverlay(name){releaseOverlay(name);overlayStack.push(name);}
function releaseOverlay(name){const index=overlayStack.indexOf(name);if(index>=0)overlayStack.splice(index,1);}
const narrow=()=>matchMedia('(max-width:900px)').matches;
function isReadableNode(n){return isLearningNode(n)||!!(n&&window.R80_READING_INDEX?.nodes[n.id]?.contentCount)||!!(n?.type==='COMPETENCY'&&window.R80_PRESENTATION_DATA?.competencyGuidesByNode?.[n.id]);}
function isLearningNode(n){return !!n&&['KNOWLEDGE','METHOD','SKILL','TOPIC','METHOD_FAMILY','THOUGHT','THINKING_PROCESS'].includes(n.type)}
function matchesFilters(n){if(n.type==='THOUGHT')return (!S.facets.length||S.facets.some(id=>n.navigationCompetencyIds.includes(id)))&&(!S.bookFilter||n.bookIds.includes(S.bookFilter));return (!S.facets.length||S.facets.some(id=>facets(n).includes(id)||n.id===id))&&(!S.bookFilter||n.bookIds.includes(S.bookFilter)||n.id===S.bookFilter)}
function assignUiKeys(){
 for(const panel of [$('detail'),$('learning-path')]){
  const seen=new Map();
  panel.querySelectorAll('details').forEach(el=>{if(el.dataset.uiKey)return;const title=el.querySelector('summary')?.textContent||'detail';const count=seen.get(title)||0;seen.set(title,count+1);el.dataset.uiKey=panel.id+':'+S.selected+':'+title+':'+count;});
 }
}
function focusKey(el){if(!el)return null;if(el.id)return {id:el.id};for(const key of ['catalogNode','filterCore','hierarchyNode','pathNode','tagComp','depth','core','found','book','chapter','edgeId','edgeNode','location','clearFilter','jump'])if(el.dataset?.[key])return {key,value:el.dataset[key],role:el.closest('[data-path-role]')?.dataset.pathRole,relation:el.closest('[data-relation-id]')?.dataset.relationId};if(el.tagName==='SUMMARY'&&el.parentElement.dataset.uiKey)return {summary:el.parentElement.dataset.uiKey};return null;}
function findFocus(key){if(!key)return null;if(key.id)return $(key.id);if(key.summary)return [...document.querySelectorAll('details[data-ui-key]')].find(d=>d.dataset.uiKey===key.summary)?.querySelector('summary');if(typeof key.key!=='string')return null;return [...document.querySelectorAll('[data-'+key.key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())+']')].find(el=>el.dataset[key.key]===key.value&&(!key.role||el.closest('[data-path-role]')?.dataset.pathRole===key.role)&&(!key.relation||el.closest('[data-relation-id]')?.dataset.relationId===key.relation));}
function captureUI(){
 const draft=$('custom-tag-input');if(draft&&$('detail').dataset.currentNode)drafts[$('detail').dataset.currentNode]=draft.value;
 return {catalogExpansion:{...catalogExpansion},readerTrail:[...readerTrail],hierarchySelection:{...hierarchySelection},hierarchyUI:hierarchyView?.capture(),graphFocusMode,catalogCollapsed:document.querySelector('.app').classList.contains('catalog-collapsed'),query:$('search').value,searchOpen:!$('results').hidden,pathScroll:$('learning-path').scrollTop,detailScroll:$('detail').scrollTop,catalogScroll:document.querySelector('.left-body').scrollTop,mainScroll:$('main').scrollTop,pageScroll:window.scrollY,catalog:document.querySelector('.left').classList.contains('open'),
  open:[...document.querySelectorAll('details[data-ui-key][open]')].map(d=>d.dataset.uiKey),notes:document.querySelector('.right').classList.contains('open'),focus:focusKey(document.activeElement),graphLayoutVersion:5,graphLayoutNarrow,camera:{...camera},overlays:[...overlayStack],positions:[...P].map(([id,p])=>[id,p.x,p.y])};
}
function restoreUI(ui){
 if(!ui)return;if(ui.catalogExpansion){catalogExpansion={...ui.catalogExpansion};renderBooks();}readerTrail=ui.readerTrail||[];$('reader-back').disabled=!readerTrail.length;if(ui.hierarchySelection){hierarchySelection={...ui.hierarchySelection};if(isHierarchy())renderHierarchy();}hierarchyView?.restore(ui.hierarchyUI);graphCameraMotion=null;if(ui.graphFocusMode!==undefined)setGraphFocusMode(ui.graphFocusMode,false);if(ui.catalogCollapsed!==undefined&&document.querySelector('.app').classList.contains('catalog-collapsed')!==ui.catalogCollapsed)toggleCatalogLayout();resizeCanvas();
 $('search').value=ui.query||'';if(ui.searchOpen)searchResults();else closeSearch();
 document.querySelectorAll('[data-motion]').forEach(el=>el.removeAttribute('data-motion'));
 const opened=new Set(ui.open||[]);document.querySelectorAll('details[data-ui-key]').forEach(d=>d.open=opened.has(d.dataset.uiKey));if($('reader-reference'))$('reader-reference').hidden=!$('reader-reference').open;
 if(ui.notes)openNotes(false);else closeNotes(false);
 if(ui.catalog&&!ui.notes)openCatalog(false);else closeCatalog(false);
 $('learning-path').scrollTop=ui.pathScroll||0;$('detail').scrollTop=ui.detailScroll||0;document.querySelector('.left-body').scrollTop=ui.catalogScroll||0;$('main').scrollTop=ui.mainScroll||0;if(window.scrollY!==(ui.pageScroll||0))window.scrollTo(0,ui.pageScroll||0);
 if(ui.graphLayoutVersion===5&&ui.graphLayoutNarrow===graphLayoutNarrow){graphCameraMotion=null;if(ui.camera)camera={...ui.camera};for(const [id,x,y] of ui.positions||[]){const p=P.get(id);if(p){p.x=x;p.y=y;}}}
 if(ui.overlays){const active=new Set(overlayStack);overlayStack.splice(0,overlayStack.length,...ui.overlays.filter(name=>active.has(name)),...overlayStack.filter(name=>!ui.overlays.includes(name)));}
 const target=findFocus(ui.focus);if(target&&target.getClientRects().length&&!target.closest('[inert]'))target.focus({preventScroll:true});draw();
}
function rememberUI(){if(applyingRoute)return;const ui=captureUI();visits.set(entryKey,ui);if(history.state?.entryKey===entryKey)history.replaceState({...history.state,ui,startId},'');}
function routeHash(){const p=new URLSearchParams({view:S.mode});if(readerId)p.set('read',readerId);p.set('layout',S.layout);if(S.layout==='layers')for(const [key,param]of [['bookId','hbook'],['chapterId','hchapter'],['knowledgeId','hnode'],['methodId','hmethod']])if(hierarchySelection[key])p.set(param,hierarchySelection[key]);for(const key of ['scope','selected'])if(S[key])p.set(key,S[key]);if(S.facets.length)p.set('facets',S.facets.join(','));if(S.bookFilter)p.set('book',S.bookFilter);p.set('depth',S.depth);if(S.colorBy!=='quiet')p.set('color',S.colorBy);if(S.spacing!==1)p.set('spacing',Math.round(S.spacing*100));if(S.hideUnrelated)p.set('isolate','1');for(const k of ['related','lessons'])if(S[k])p.set(k,'1');if(!S.methods)p.set('methods','0');if(!S.thoughts)p.set('thoughts','0');if(hierarchySelection.thoughtId)p.set('hthought',hierarchySelection.thoughtId);return '#'+p}
function pushRoute(replace=false){
 if(applyingRoute)return;if(!startId&&isLearningNode(byId(S.selected)))startId=S.selected;
 const hash=routeHash();if(hash===location.hash&&history.state?.startId===startId){updateTrail();return;}
 if(!replace){routeIndex++;entryKey=crypto.randomUUID();}
 history[replace?'replaceState':'pushState']({...(replace?history.state:{}),mathNetwork:true,index:routeIndex,entryKey,startId,ui:captureUI()},'',hash);updateTrail();
}
function updateTrail(){
 $('go-back').disabled=routeIndex===0;$('graph-back').disabled=routeIndex===0;$('trail-label').innerHTML=S.selected?'正在阅读 · '+mathText(byId(S.selected).name):'从一个知识点开始';$('show-notes').disabled=!S.selected;
 $('journey-start').hidden=!startId;$('journey-start').innerHTML=startId?'本次起点：'+mathText(byId(startId)?.name):'';
}
function readRoute(ui){
 applyingRoute=true;const p=new URLSearchParams(location.hash.slice(1)),m=p.get('view'),fresh=!p.size;S.layout=p.get('layout')==='free'||fresh?'free':'layers';hierarchySelection={thoughtId:p.get('hthought'),bookId:p.get('hbook'),chapterId:p.get('hchapter'),knowledgeId:displayId(p.get('hnode')),methodId:p.get('hmethod'),query:ui?.hierarchySelection?.query||''};S.mode=['overview','all','book','chapter','competency','neighbors','path','before','after'].includes(m)?m:'all';
 for(const key of ['scope','selected'])S[key]=N.has(p.get(key))?displayId(p.get(key)):null;
 S.facets=(p.get('facets')||p.get('facet')||'').split(',').filter(id=>byId(id)?.type==='COMPETENCY');S.facet=S.facets[0]||null;
 S.bookFilter=byId(p.get('book'))?.type==='TEXTBOOK'?p.get('book'):null;
 graphPinned=null;graphHover=null;S.colorBy=['type','domain'].includes(p.get('color'))?p.get('color'):'quiet';S.spacing=Math.min(2.2,Math.max(1,(Number(p.get('spacing'))||100)/100));S.hideUnrelated=p.get('isolate')==='1';S.depth=p.get('depth')==='2'?2:1;for(const k of ['related','lessons'])S[k]=fresh||p.get(k)==='1';S.methods=p.get('methods')!=='0';S.thoughts=p.get('thoughts')!=='0';
 if(['book','chapter','competency','neighbors','before','after'].includes(S.mode)&&!S.scope)S.mode='overview';
 if(S.mode==='path'&&!isReadableNode(byId(S.scope)))S.scope=null;
 if(S.mode==='path'||(S.scope&&!S.selected))S.selected=S.scope;
 readerId=S.mode!=='path'&&isReadableNode(byId(p.get('read')))?displayId(p.get('read')):null;readerTrail=ui?.readerTrail||[];
 if(!p.has('hbook')&&(byId(S.scope)?.type==='TEXTBOOK'||byId(S.scope)?.type==='CHAPTER'||byId(S.selected)?.type==='KNOWLEDGE'))hierarchySelection=hierarchyModel.locate(S.scope||S.selected,hierarchySelection);
 for(const [id,k] of [['show-related','related'],['show-lessons','lessons'],['show-methods','methods'],['show-thoughts','thoughts']])$(id).checked=S[k];
 closeNotes(false);closeCatalog(false);if(fresh&&!ui){document.querySelector('.app').classList.add('catalog-collapsed');$('catalog-layout-toggle').setAttribute('aria-expanded','false');$('catalog-layout-toggle').setAttribute('aria-label','展开教材目录');}renderedScope=null;rebuild();if(ui)restoreUI(ui);else if(isLearningNode(byId(S.selected))&&!startId)startId=S.selected;
 applyingRoute=false;updateTrail();
}
function updateOverlay(){
 document.querySelector('.app').inert=!!readerId;document.querySelector('header').inert=!!readerId;
 const cat=document.querySelector('.left'),notes=document.querySelector('.right'),catOpen=cat.classList.contains('open')&&narrow(),notesOpen=notes.classList.contains('open')&&narrow();
 $('main').inert=catOpen||notesOpen;document.querySelector('header').inert=!!readerId||catOpen||notesOpen;
 cat.inert=narrow()&&!catOpen||notesOpen;notes.inert=!notes.classList.contains('open')||catOpen;
 for(const [el,open]of [[cat,catOpen],[notes,notesOpen]]){if(open){el.setAttribute('role','dialog');el.setAttribute('aria-modal','true')}else{el.removeAttribute('role');el.removeAttribute('aria-modal');}}
}
function openCatalog(focus=true){if(focus!==false)catalogCaller=document.activeElement;closeNotes(false);document.querySelector('.left').classList.add('open');$('nav-toggle').setAttribute('aria-expanded','true');$('nav-backdrop').hidden=false;activateOverlay('catalog');updateOverlay();if(focus!==false)$('catalog-close').focus({preventScroll:true});}
function closeCatalog(restore=true){releaseOverlay('catalog');const was=document.querySelector('.left').classList.contains('open');document.querySelector('.left').classList.remove('open');$('nav-toggle').setAttribute('aria-expanded','false');$('nav-backdrop').hidden=true;updateOverlay();if(was&&restore)(catalogCaller?.isConnected?catalogCaller:$('nav-toggle')).focus({preventScroll:true});}
function closeNotes(restore=true){releaseOverlay('notes');const was=document.querySelector('.right').classList.contains('open');document.querySelector('.right').classList.remove('open');document.querySelector('.app').classList.remove('notes-open');$('show-notes').setAttribute('aria-expanded','false');updateOverlay();if(was&&restore)(notesCaller?.isConnected?notesCaller:$('show-notes')).focus({preventScroll:true});}
function openNotes(focus=true){if((readerId||S.mode==='path')&&$('reader-reference')){const ref=$('reader-reference');ref.hidden=false;ref.open=true;ref.scrollIntoView({block:'start'});ref.querySelector('summary').focus({preventScroll:true});return;}if(focus!==false)notesCaller=document.activeElement;closeCatalog(false);activateOverlay('notes');document.querySelector('.right').classList.add('open');document.querySelector('.app').classList.add('notes-open');$('show-notes').setAttribute('aria-expanded','true');updateOverlay();if(focus!==false)$('clear').focus({preventScroll:true});}
function closeSearch(){ releaseOverlay('search');$('results').hidden=true;$('search').setAttribute('aria-expanded','false'); }
const searchAliases={'kp:21093':['函数的零点'],'kp:21263':['零点存在定理','函数零点存在定理'],'kp:21264':['区间二分法','二分法求方程近似解']};
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/图像/g,'图象').trim().replace(/\s+/g,' ');
function searchScore(n,q){const name=normalize(n.name),aliases=[...(n.aliases||[]),...(searchAliases[n.id]||[])].map(normalize);if(name===q||normalize(n.id)===q)return 0;if(aliases.includes(q))return 1;if(name.startsWith(q)||aliases.some(a=>a.startsWith(q)))return 2;if([name,...aliases,...customTags(n).map(normalize)].some(a=>a.includes(q)))return 3;return 99;}
function searchResults(){queueMicrotask(()=>window.MethodDecisionUI?.updateSearch());
 const q=normalize($('search').value);if(!q){closeSearch();return;}
 const all=G.nodes.map(n=>({n,rank:searchScore(n,q)})).filter(x=>x.rank<99).sort((a,b)=>a.rank-b.rank||a.n.name.localeCompare(b.n.name,'zh-CN'));
 const rawFiltered=all.filter(x=>matchesFilters(x.n)),filtered=displaySearch(rawFiltered),found=filtered.slice(0,35);$('results').hidden=false;activateOverlay('search');$('search').setAttribute('aria-expanded','true');
 $('results').innerHTML=found.length?`<p class="search-caption">${filtered.length} 个显示匹配${rawFiltered.length!==filtered.length?' · '+rawFiltered.length+'条原记录':''}${filtered.length>35?' · 显示前 35 个':''} · 按名称和教材定位</p>`+found.map(({n,rank})=>`<button data-found="${esc(n.id)}" data-node-type="${n.type}"><span class="search-result-title"><span class="type-badge" data-node-type="${n.type}">${esc(displayType(n))}</span><span>${mathText(n.name)}</span></span><small>${esc(n.bookIds.map(b=>byId(b)?.name).join(' / '))}${n.chapterIds.length?'<br>'+esc(n.chapterIds.map(c=>byId(c)?.name).join(' / ')):''}</small></button>`).join(''):`<p class="search-caption" role="status">${all.length?'当前筛选下无结果；全课程有 '+all.length+' 个匹配。':'未找到这个名称，试试知识名称、方法或编号。'}</p>${all.length?'<button id="search-clear-filters">清除筛选，查看全课程</button>':''}`;
 document.querySelectorAll('[data-found]').forEach(b=>b.onclick=()=>selectSearch(b.dataset.found));if($('search-clear-filters'))$('search-clear-filters').onclick=()=>{S.facets=[];S.facet=null;S.bookFilter=null;rebuild();pushRoute(true);searchResults();};
}
function selectSearch(id){choose(id,true,'search');($('reader-title')||$('view-title')).focus({preventScroll:true});}
window.KnowledgeSearchNavigation={
 capture:()=>({query:$('search').value,scroll:$('results').scrollTop}),
 restore:(context,entry)=>{
  searchResults();
  return new Promise(resolve=>queueMicrotask(()=>{
   const same=$('search').value===context.query,button=same?$('results').querySelector(entry):null;
   if(same)$('results').scrollTop=context.scroll;
   (button&&!$('results').hidden&&button.getClientRects().length&&!button.disabled?button:$('search')).focus({preventScroll:true});
   rememberUI();resolve();
  }));
 }
};
function selectCatalogKnowledge(id){
 if(byId(id)?.type!=='KNOWLEDGE')return;
 setView(S.mode==='path'?'path':'neighbors',id,'directory');
 if(narrow()){$('graph-focus-title').focus({preventScroll:true});if(S.mode==='path')$('reader-title')?.focus({preventScroll:true});}
 else document.querySelector(`[data-catalog-node="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
}
function renderBooks(){
 const current=byId(readerId||S.scope||S.selected),isOpen=(id,automatic)=>catalogExpansion[id]??!!automatic;
 $('book-count').textContent=books.length+' 册';$('competencies').innerHTML=comps.map(n=>`<button aria-pressed="${S.facets.includes(n.id)}" class="${S.facets.includes(n.id)?'active':''}" data-core="${n.id}"><span></span>${mathText(n.name)}</button>`).join('');
 $('books').innerHTML=books.map(b=>{
  const chapters=G.nodes.filter(n=>n.type==='CHAPTER'&&n.bookIds.includes(b.id)),open=isOpen(b.id,current?.bookIds.includes(b.id)||S.bookFilter===b.id);
  return `<div class="book"><button data-book="${b.id}" aria-controls="catalog-${b.id}" aria-expanded="${open}"><i class="catalog-chevron" aria-hidden="true">›</i><span>${mathText(b.name)}</span><small>${chapters.length} 章</small></button><div id="catalog-${b.id}" class="chapter-list" ${open?'':'hidden'}>${chapters.map(c=>{
   const points=G.nodes.filter(n=>n.type==='KNOWLEDGE'&&n.chapterIds.includes(c.id)),expanded=isOpen(c.id,current?.chapterIds.includes(c.id));
   return `<div class="catalog-chapter"><button data-chapter="${c.id}" aria-controls="catalog-${c.id}" aria-expanded="${expanded}"><i class="catalog-chevron" aria-hidden="true">›</i><span>${mathText(c.name)}</span><small>${points.length}</small></button><div class="catalog-points" id="catalog-${c.id}" ${expanded?'':'hidden'}>${points.map(n=>`<button data-catalog-node="${n.id}" data-node-type="KNOWLEDGE" ${current?.id===n.id?'aria-current="true"':''}><i aria-hidden="true"></i><span>${mathText(n.name)}</span></button>`).join('')||'<p>本章暂无知识点。</p>'}</div></div>`;
  }).join('')}</div></div>`;
 }).join('');
 document.querySelectorAll('[data-core]').forEach(b=>b.onclick=()=>applyFilters(()=>{const id=b.dataset.core;S.facets=S.facets.includes(id)?S.facets.filter(x=>x!==id):[...S.facets,id];}));
 for(const key of ['book','chapter'])document.querySelectorAll('[data-'+key+']').forEach(b=>b.onclick=()=>{
  const scroll=document.querySelector('.left-body').scrollTop,id=b.dataset[key];catalogExpansion[id]=b.getAttribute('aria-expanded')!=='true';renderBooks();document.querySelector('.left-body').scrollTop=scroll;findFocus({key,value:id})?.focus({preventScroll:true});rememberUI();
 });
 document.querySelectorAll('[data-catalog-node]').forEach(b=>b.onclick=()=>selectCatalogKnowledge(b.dataset.catalogNode));
}
function applyFilters(change){
 const focus=focusKey(document.activeElement);rememberUI();change();S.facet=S.facets[0]||null;
 if(['overview','book','chapter','competency'].includes(S.mode)){S.mode='all';S.scope=null;}
 rebuild();pushRoute(true);findFocus(focus)?.focus({preventScroll:true});
}
function renderFilterSummary(){
 const labels=[...S.facets.map(id=>({key:id,label:byId(id).name})),...(S.bookFilter?[{key:'book',label:byId(S.bookFilter).name}]:[])];
 $('filter-summary').hidden=!labels.length;$('filter-summary').innerHTML=labels.map(x=>`<button data-clear-filter="${x.key}" aria-label="移除${esc(x.label)}筛选">${esc(x.label)} ×</button>`).join('')+`<span>${S.facets.length?'符合任一已选素养'+(S.bookFilter?'，且属于所选教材':''):'属于所选教材'} · ${G.nodes.filter(n=>isLearningNode(n)&&matchesFilters(n)).length} 个知识与方法条目</span>`;
 $('filter-description').textContent=['neighbors','before','after','path'].includes(S.mode)?'筛选用于搜索与分层目录。当前前后置联系和左侧章节导航保持完整，便于跨章查找。':'筛选用于搜索与分层目录；选择知识点后，前后置图仍保留完整联系。';
 $('filter-core-options').innerHTML=comps.map(n=>`<button data-filter-core="${n.id}" aria-pressed="${S.facets.includes(n.id)}">${mathText(n.name)}</button>`).join('');
 $('filter-book').innerHTML='<option value="">全部教材</option>'+books.map(n=>`<option value="${n.id}" ${S.bookFilter===n.id?'selected':''}>${mathText(n.name)}</option>`).join('');
 $('filter-clear').disabled=!labels.length;$('filter-state').textContent=labels.length?'已筛选 · '+G.nodes.filter(n=>isLearningNode(n)&&matchesFilters(n)).length+' 个知识与方法条目':'未筛选 · 搜索全部教材';
 document.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>applyFilters(()=>{if(b.dataset.clearFilter==='book')S.bookFilter=null;else S.facets=S.facets.filter(x=>x!==b.dataset.clearFilter);}));
 document.querySelectorAll('[data-filter-core]').forEach(b=>b.onclick=()=>applyFilters(()=>{const id=b.dataset.filterCore;S.facets=S.facets.includes(id)?S.facets.filter(x=>x!==id):[...S.facets,id];}));
 $('filter-book').onchange=e=>{const value=e.target.value;applyFilters(()=>{S.bookFilter=value||null;});};
 $('filter-clear').onclick=()=>applyFilters(()=>{S.facets=[];S.bookFilter=null;});
}
function isReaderEvidence(value){return !/mathtrek|原网站|原平台/i.test(typeof value==='string'?value:JSON.stringify(value));}
function parsedEvidence(edge){return (edge.evidence||[]).filter(isReaderEvidence).map(e=>{if(typeof e==='object')return e;try{return JSON.parse(e);}catch{return {index:e};}});}
function needsConcreteReason(edge){return !edge.rationale||/用于理解定义、表示或实施该方法/.test(edge.rationale)||['实施方法所需概念或运算准备。','针对该知识领域的可用方法；方法选择仍依赖题目条件。','教学设计关联，不是素养达成度判定。','由适用方法的素养关联投影；不是排他分类或达成评价。'].includes(edge.rationale);}
function relationExplanation(edge){return window.RELATION_EXPLANATIONS?.[edge.id];}
function reasonHTML(edge){return TextbookReader.text(relationExplanation(edge)?.reason||(!needsConcreteReason(edge)?edge.rationale:''));}
function edgeDirection(edge){return mathText(byId(edge.source)?.name||edge.source)+(edge.directed===false||['RELATED_TO','PARALLEL_WITH','POSSIBLE_OVERLAP','CO_DEVELOPS'].includes(edge.type)?' — ':' → ')+mathText(byId(edge.target)?.name||edge.target);}
function evidenceStatus(edge){return STATUS[edge.status]||'未识别状态 · 待核';}
function excerptHTML(e,label){return e.excerpt?`<div class="source-excerpt"><b>${esc(label)}</b><p>${mathText(e.excerpt)}</p>${e.printedPages?.length?'<small>正文 '+esc(e.printedPages.join('–'))+' 页</small>':''}</div>`:'';}
function evidenceBlock(edge){
 const explanation=relationExplanation(edge),reason=reasonHTML(edge),pageNodes=[byId(edge.source),byId(edge.target)].filter(n=>n&&TextbookReader.nodePages(n.id).length);
 const raw=parsedEvidence(edge),direct=raw.filter(e=>e.excerpt),context=[byId(edge.source),byId(edge.target)].flatMap(n=>n?.methodEvidence||[]),excerpts=[...direct,...context.filter(e=>!direct.some(d=>d.excerpt===e.excerpt))];
 const pages=explanation?explanation.supports.map(ref=>`<p>${mathText(byId(ref.nodeId).name)}</p>${TextbookReader.links(ref.nodeId,ref.anchorIds)}`).join(''):pageNodes.map(n=>'<p>'+mathText(n.name)+'</p>'+TextbookReader.entry(n.id)).join('');
 const thoughtSources=(edge.thoughtMapping?.contentReferences||[]).map(ref=>'<button type="button" data-method-reference="'+esc(ref.contentId)+'">'+mathText(ref.title)+'</button>').join('');
 return `<div class="edge-evidence evidence-body" data-evidence-status="${esc(edge.status)}"><h4>联系说明</h4>${thoughtSources?'<h4>教案中的具体依据</h4><div class="method-nav-links">'+thoughtSources+'</div>':''}<p class="edge-direction">${edgeDirection(edge)}</p><p>${reason||'已记录这条联系，暂未附针对这两个条目的具体解释。可以先阅读下方的相关内容。'}</p>${explanation?.usage?`<p><b>用在什么地方</b><br>${mathText(explanation.usage)}</p>`:''}<p class="support-scope">${esc(RELATION_HELP[edge.type]||'按已记录的方向探索相关知识。')}</p>${pages?'<h4>对照教材阅读</h4>'+pages:excerpts.length?'<h4>相关材料</h4>'+excerpts.map(e=>excerptHTML(e,'参考摘录')).join(''):''}</div>`;
}
function pathRow(item,direction){
 const n=byId(item.id),key=direction+':'+item.trail.map(e=>e.id||e.source+'>'+e.target).join('|'),trail=direction==='before'?item.trail.slice().reverse():item.trail,reason=reasonHTML(item.edge);
 const route=item.distance>1?[trail[0].source,...trail.map(e=>e.target)].map(id=>mathText(byId(id).name)).join(' <span aria-hidden="true">→</span> '):'';
 return `<article class="path-row" data-node-type="${n.type}" data-path-role="${direction}" data-relation-id="${esc(item.edge.id)}" data-evidence-status="${esc(item.edge.status)}"><div class="path-meta">${item.distance===1?'相邻知识':(direction==='before'?'更早的准备':'后续延伸')+' · 经过 '+mathText(byId(item.via).name)} · <span class="type-badge" data-node-type="${n.type}">${esc(displayType(n))}</span></div><button class="path-link" data-path-node="${n.id}"><span>${mathText(n.name)}</span><small>查看</small></button>${route?`<p class="relation-route" aria-label="完整联系路径">${route}</p>`:''}${reason?`<p class="relation-reason">${reason}</p>`:''}<details data-ui-key="${esc(key)}"><summary>${reason?'为什么关联':'查看联系'} <span>${route?'逐段说明与教材':'说明与教材'}</span></summary><div class="evidence-body">${trail.map(evidenceBlock).join('')}</div></details></article>`;
}
function scopeCounts(items){const inside=items.filter(x=>matchesFilters(byId(x.id))).length;return {inside,outside:items.length-inside};}
function relationColumn(items,direction){
 // Traverse first, group second: an outside intermediary must remain in the trail.
 const match=items.filter(x=>matchesFilters(byId(x.id))),other=items.filter(x=>!matchesFilters(byId(x.id)));
 if(!items.length)return `<div class="path-gap">暂未整理${direction==='before'?'前置':'后续'}联系。<br><span>这不代表没有相关知识。</span></div>`;
 return match.map(x=>pathRow(x,direction)).join('')+(other.length?`<details class="outside-filter" data-ui-key="outside:${direction}"><summary>范围外 ${other.length} 项 · 展开</summary><div class="evidence-body"><p>这些联系超出当前筛选范围，仍保留在学习路径中，可继续查看。</p>${other.map(x=>pathRow(x,direction)).join('')}</div></details>`:'');
}
function compactLinks(title,edges,id){
 if(!edges.length)return '';
 return `<section class="method-links"><h3>${title}</h3>${edges.map(e=>{const n=byId(e.source===id?e.target:e.source);return `<article class="method-row" data-node-type="${n.type}" data-path-role="method" data-relation-id="${esc(e.id)}" data-evidence-status="${e.status}"><button data-path-node="${n.id}" data-node-type="${n.type}"><span>${mathText(n.name)}</span><small>${esc(displayType(n))} · ${esc(e.type==='USES_KNOWLEDGE'?(e.source===id?'用到的知识':'使用它的方法'):(e.source===id?'可调用的方法':'可用于的任务'))}</small></button><details data-ui-key="method:${esc(e.id)}"><summary>使用依据 <span>教材与关系说明</span></summary>${evidenceBlock(e)}</details></article>`;}).join('')}</section>`;
}
const FACET_BASIS={standard_theme_explicit:'主题目标',inherited_from_standard_theme:'主题继承',method_or_activity_mapping:'编辑对应'};
function competencyInfo(n,id){const original=n.competencyFacets?.find(f=>f.id===id),mine=Object.prototype.hasOwnProperty.call(annotations[n.id]||{},'competencyIds');return {original,basis:mine?'user_annotation':original?.basis||'method_or_activity_mapping',label:mine?'我的标注':FACET_BASIS[original?.basis]||'编辑对应'};}
function hasFacetBasis(n,id){return !!n.competencyFacets?.some(f=>f.id===id)||!!annotations[n.id]?.competencyIds?.includes(id);}
function facetEdge(n,id,prefix){const info=competencyInfo(n,id);return {id:prefix+':'+id+':'+n.id,source:id,target:n.id,type:'COMPETENCY_TAG',status:{user_annotation:'user_annotation',standard_theme_explicit:'provided_standard_explicit',inherited_from_standard_theme:'inherited_tag',method_or_activity_mapping:'editorial_mapping'}[info.basis],basis:info.basis,rationale:info.label+' · '+(info.original?.scope||'本地对应'),evidence:n.evidence||[]};}
function competencyEvidence(n,id){
 const info=competencyInfo(n,id),original=info.original,refs=(incident.get(n.id)||[]).filter(e=>e.source===id&&['EMPHASIZES','DEVELOPS_THROUGH'].includes(e.type));
 const themeIds=[...(n.topicIds||[]),...(n.chapterIds||[])],themes=[...new Set(themeIds)].map(byId).filter(t=>t&&t.competencyFacets?.some(f=>f.id===id));
 const anchors=[...new Map((info.basis==='standard_theme_explicit'||original?.basis==='standard_theme_explicit'?[n]:themes).flatMap(t=>(t.standardReferences||[]).map(r=>({r,t}))).map(x=>[x.r.requirementId||x.t.id+':'+x.r.name,x])).values()];
 return `<div class="edge-evidence evidence-body"><p><b>${esc(info.label)}</b> · ${mathText(byId(id).name)}</p>${info.basis==='user_annotation'?`<p>当前关联由你的本地标注决定。原始对应：${original?esc(FACET_BASIS[original.basis]||original.basis)+' · '+esc(original.scope||''):'该素养没有原始对应记录。'}</p>`:`<p>${esc(original?.scope||'编辑教学对应')}</p>`}${original?.basis==='inherited_from_standard_theme'?`<p>按主题继承匹配，保留主题层面的依据。</p>`:''}${refs.map(e=>evidenceBlock(e)).join('')}${themes.length?`<p>相关主题：${themes.map(t=>mathText(t.name)).join(' · ')}</p>`:''}${anchors.map(({r,t})=>`<section class="source-excerpt"><b>${mathText(t.name)} · ${esc(r.name||'课标主题依据')}</b>${r.summary?`<p>${mathText(r.summary)}</p>`:''}${excerptHTML(r.anchor||r,'原始课标摘录')}<p class="support-scope">${mathText(r.notes||'主题整体对应，不代表已逐点核定要求。')}</p></section>`).join('')}${!refs.length&&!anchors.length?'<p class="source-missing">此处尚未附针对该素养的具体说明。</p>':''}</div>`;
}
function competencyBadges(n,context='reader'){return facets(n).map(id=>{const info=competencyInfo(n,id);return `<details class="competency-evidence" data-ui-key="competency:${context}:${n.id}:${id}" data-evidence-status="${info.basis}"><summary data-node-type="COMPETENCY"><span>${esc(byId(id)?.name)}<small>${info.label}</small></span></summary>${competencyEvidence(n,id)}</details>`;}).join('');}
function textbookLocation(n,context='reader'){
 const sorted=n.bookIds.slice().sort((a,b)=>Number(b===S.bookFilter)-Number(a===S.bookFilter));
 if(!sorted.length)return '<span>教材位置尚未记录。</span>';
 const paths=hierarchyModel.curriculumPaths(n.id),placements=n.curriculumPlacements||[];
 const locateButton=(bookId,chapterId)=>n.type==='KNOWLEDGE'?'<button type="button" data-curriculum-locate="'+esc(n.id)+'" data-curriculum-book="'+esc(bookId)+'" data-curriculum-chapter="'+esc(chapterId||'')+'">在分层图谱中定位</button>':'';
 return '<div class="textbook-location">'+sorted.map(bookId=>{
  const chapters=n.chapterIds.map(byId).filter(c=>c.bookIds.includes(bookId)),bookPaths=paths.filter(p=>p.nodeIds.includes(bookId)),entries=placements.filter(p=>p.bookId===bookId);
  const sections=[...new Set(bookPaths.flatMap(p=>p.nodeIds).filter(id=>byId(id)?.type==='SECTION'))].map(byId);
  const origins=[...new Set(bookPaths.flatMap(p=>p.nodeIds).filter(id=>id!==n.id&&byId(id)?.type==='KNOWLEDGE'))].map(byId);
  const positions=(n.sourcePlacements||[]).filter(p=>n.bookIds.length===1||(incident.get(n.id)||[]).some(e=>e.type==='TEACHES'&&e.target===n.id&&byId(e.source)?.bookIds.includes(bookId)&&sections.some(s=>p.name.replace(/[①②③④⑤⑥⑦⑧⑨⑩].*$/,'').trim()===s.name)));
  const summary='教材位置：'+byId(bookId).name+(chapters.length?' / '+chapters.map(c=>c.name).join(' · '):'')+(sections.length?' / '+sections.map(c=>c.name).join(' · '):'');
  const scoped=entries.map(p=>{
   const pages=[...new Map(p.references.filter(r=>r.anchorId&&window.READING_DATA?.anchors[r.anchorId]).map(r=>{const a=window.READING_DATA.anchors[r.anchorId];return [a.pdfPage,a];})).values()];
   return '<section class="curriculum-placement" data-curriculum-role="'+esc(p.role)+'" data-curriculum-section="'+esc(p.sectionId)+'"><p><strong>'+esc(p.label)+'</strong> · '+mathText(byId(p.sectionId).name)+'</p>'+(p.note?'<p>'+esc(p.note)+'</p>':'')+'<p class="placement-source">'+esc(p.sourceLabel)+'</p>'+(pages.length?'<div class="textbook-page-links">'+pages.map(a=>'<button type="button" data-textbook-node="'+esc(n.id)+'" data-textbook-anchor="'+esc(a.anchorId)+'">'+esc(a.book)+' · 第 '+esc(a.printedPage)+' 页</button>').join('')+'</div>':'')+locateButton(bookId,p.chapterId)+'</section>';
  }).join('');
  const legacy=chapters.map(c=>'<p>'+mathText(c.name)+'</p>').join('')+(positions.length?'<p class="placement-note">相关课节：'+positions.map(x=>mathText(x.name)).join(' · ')+'</p>':'')+(sections.length?'<p>所属课节：'+sections.map(c=>mathText(c.name)).join(' · ')+'</p>':'')+(origins.length?'<p>与原条目“'+origins.map(c=>mathText(c.name)).join('、')+'”共用目录出处。</p>':'')+locateButton(bookId,chapters[0]?.id);
  return '<details class="location-evidence" data-ui-key="location:'+context+':'+esc(n.id)+':'+esc(bookId)+'" data-evidence-status="'+(entries.length?'editorial_mapping':'source_record')+'"><summary data-location="'+esc(bookId)+'" data-location-type="book">'+esc(summary)+'</summary><div class="edge-evidence evidence-body"><h4>教材与目录定位</h4>'+(entries.length?scoped:legacy)+'<p>可阅读的正文位置在“教材原页”中列出。</p></div></details>';
 }).join('')+'</div>';
}
function currentFilterNote(n){
 if(!S.bookFilter&&!S.facets.length)return '';
 if(!matchesFilters(n))return '<p class="current-filter-note">当前点不在筛选范围，保留它继续阅读。</p>';
 const inherited=S.facets.filter(id=>facets(n).includes(id)&&competencyInfo(n,id).basis==='inherited_from_standard_theme');
 return inherited.length?`<p class="current-filter-note">${inherited.map(id=>mathText(byId(id).name)).join('、')}：按主题继承匹配。</p>`:'';
}
function renderJourney(){
 if($('detail'))document.querySelector('.right').append($('detail'));
 const path=S.mode==='path';document.querySelector('.app').classList.toggle('path-mode',path);$('graph-workspace').hidden=path;
 const sheet=!!readerId&&!path;$('reader-overlay').hidden=!sheet;document.body.classList.toggle('reader-open',sheet);
 if(sheet){$('reader-body').append($('learning-path'));activateOverlay('reader');$('reader-back').disabled=!readerTrail.length;$('reader-context').textContent=readerTrail.length?'已阅读 '+readerTrail.length+' 个关联条目 · 可返回':'保留图谱位置，原位阅读';}else{$('main').insertBefore($('learning-path'),$('graph-workspace'));releaseOverlay('reader');}
 updateOverlay();
 if(path){closeGraphPanel(false);if(graphFocusMode)setGraphFocusMode(false,false);$('main').insertBefore($('filter-summary'),$('learning-path'));}else{$('graph-scope-content').append($('filter-summary'));}
 updateGraphControls();$('learning-path').hidden=!(path||sheet);$('graph-wrap').hidden=path||isHierarchy();$('hierarchy-view').hidden=!isHierarchy();document.querySelector('.app').classList.toggle('hierarchy-mode',isHierarchy());if(isHierarchy())renderHierarchy();$('reset').hidden=path;$('show-notes').hidden=!S.selected;$('show-notes').textContent=path?'个人标记':'知识说明';
 $('options-summary').textContent=S.methods?'知识与方法':'知识';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===S.mode));$('chain').setAttribute('aria-pressed',path);updateTrail();
 if(!path&&!sheet){$('view-title').removeAttribute('aria-hidden');renderGraphRelations();nodeMotionId=null;return;}
 const n=byId(readerId||S.scope);
 $('learning-path').setAttribute('aria-label',n?.type==='THOUGHT'?'数学思想与跨章节联系':'前置、当前与后续知识');
 document.querySelector('.reader-sheet-bar b').textContent=n?.type==='THOUGHT'?'数学思想':'知识详解';
 if(n?.type==='THOUGHT'){renderThoughtReader(n);return;}
 if(!n){$('view-title').textContent='从一个问题开始';$('view-count').textContent='';$('learning-path').innerHTML=`<div class="path-empty"><h2>需要先理解什么，<br>又能用来解决什么？</h2><p>选择一个知识点，沿着真实记录的联系阅读。</p><div class="example-links">${['函数零点','基本不等式','二分法'].map(name=>{const n=G.nodes.find(n=>n.name===name);return `<button data-path-node="${n.id}" data-exploration-start="true">${esc(name)}</button>`;}).join('')}</div></div>`;bindPathLinks();return;}
 const before=pathModel.walk(n.id,'before',S.depth),after=pathModel.walk(n.id,'after',S.depth),es=incident.get(n.id)||[],reading=TextbookReader.articles(n.id),sample=!reading.length&&window.READER_CONTENT?.[n.id],bc=scopeCounts(before),ac=scopeCounts(after),uses=n.id==='kp:21169'?[]:es.filter(e=>e.type==='USES_KNOWLEDGE'&&allowed(e)),solutions=n.id==='kp:21169'?[]:es.filter(e=>e.type==='SOLVED_BY'&&allowed(e)),methodCount=uses.length+solutions.length,method=['METHOD','METHOD_FAMILY'].includes(n.type);
 $('view-title').innerHTML=mathText(n.name);$('view-count').textContent='';$('breadcrumb').textContent='知识详解 · '+displayType(n);
 $('learning-path').innerHTML=`<nav class="path-jumps" aria-label="跳到路径区域"><button data-jump="current-column">当前</button><button data-jump="before-column">前置 ${before.length}</button><button data-jump="after-column">后续 ${after.length}</button>${methodCount?`<button data-jump="method-section">${method?'应用':'方法'} ${methodCount}</button>`:''}</nav>
 <section class="current-column" aria-label="当前知识"><article class="current-node" data-node-type="${n.type}" data-path-role="current">
 <div class="reader-meta"${nodeMotionId===n.id?' data-motion="node"':''}><span class="role-badge" data-path-role="current">当前</span><span class="type-badge" data-node-type="${n.type}">${esc(displayType(n))}</span></div><h1 id="reader-title" tabindex="-1">${TextbookReader.text(n.name)}</h1>${window.MethodDecisionUI?.summary(n.id)||''}${TextbookReader.overview(n.id)||`<p class="reader-description">${TextbookReader.text(nodeDescription(n))}</p>`}${readerRequirements(n)}${currentFilterNote(n)}<details class="reader-competencies" data-ui-key="facets:${n.id}"><summary>素养关联 <span>${facets(n).map(id=>mathText(byId(id).name)).join(' · ')}</span></summary><div class="path-tags" aria-label="素养关联与个人标签">${competencyBadges(n)}${customTags(n).map(t=>`<span># ${esc(t)}</span>`).join('')}</div></details>${TextbookReader.entry(n.id)}${textbookLocation(n)}${methodCount?`<div class="method-summary"><button data-jump="method-section">${method?'实施用到的知识 / 可用于的任务':'相关方法'} ${methodCount} 项 · 查看</button></div>`:''}
 ${TextbookReader.render(n.id)}${sample?`<details class="concept-notes" data-ui-key="concept:${n.id}"><summary>定义、条件与辨析 <span>编辑释义</span></summary><div class="evidence-body"><p class="content-status">教材归属已有目录定位；以下释义待教师与教材正文逐句核对。</p>${sample.notes.map(x=>`<p>${mathText(x)}</p>`).join('')}${sample.formulas.map(x=>`<div class="math-line" tabindex="0" aria-label="数学表达式">${TextbookReader.math(x)}</div>`).join('')}</div></details>`:''}${!reading.length&&n.tags?.['适用条件']?`<p class="method-condition">${mathText(n.tags['适用条件'])}</p>`:''}${!reading.length&&n.steps?.length?`<details class="path-steps" data-ui-key="steps:${n.id}" open><summary>如何实施 · ${n.steps.length} 步 <span>编辑整理</span></summary><div class="evidence-body"><ol>${n.steps.map(x=>`<li>${mathText(x)}</li>`).join('')}</ol></div></details>`:''}<div class="reader-actions"><button id="path-network">聚焦前后置图</button></div></article></section>

 <div class="path-controls"><div class="depth-tabs" role="group" aria-label="查看多少前后联系" aria-describedby="depth-help"><button data-depth="1" aria-pressed="${S.depth===1}">相邻知识</button><button data-depth="2" aria-pressed="${S.depth===2}">再延伸一步</button></div><div id="depth-help" class="depth-help" role="status">${S.depth===1?'显示与当前知识直接相连的前置和后续。':'再看前置知识的前置、后续知识的后续；卡片会标出经过的知识点。'}</div></div>
 <div class="path-columns"><section class="path-column before-column" data-path-role="before"><div class="column-heading"><h2 tabindex="-1">前置准备</h2><span>${before.length} 项</span></div><p class="column-hint">理解当前内容，可以先回看</p>${S.facets.length||S.bookFilter?`<p class="scope-count">范围内 ${bc.inside} 项，范围外 ${bc.outside} 项</p>`:''}${relationColumn(before,'before')}</section><section class="path-column after-column" data-path-role="after"><div class="column-heading"><h2 tabindex="-1">后续知识</h2><span>${after.length} 项</span></div><p class="column-hint">以当前内容为准备，继续探索</p>${S.facets.length||S.bookFilter?`<p class="scope-count">范围内 ${ac.inside} 项，范围外 ${ac.outside} 项</p>`:''}${relationColumn(after,'after')}</section></div>
 <div class="method-section" data-path-role="method" tabindex="-1" aria-label="方法使用关系">${compactLinks(method?'实施用到的知识':'哪些方法使用它',uses,n.id)}${compactLinks(method?'可用于的任务':'可调用的解题方法',solutions,n.id)}</div>
 <details id="reader-reference" class="reader-reference" data-ui-key="personal-tools:${n.id}" hidden><summary>个人标记与课程要求 <span>收起</span></summary><div id="reader-reference-slot"></div></details><div class="path-footnote">沿前置知识回看准备，沿后续知识探索应用。</div>`;
 detail(n.id,true);$('reader-reference-slot').append($('detail'));$('reader-reference').addEventListener('toggle',()=>{const ref=$('reader-reference');if(ref&&!ref.open&&!ref.hidden){ref.hidden=true;(readerId?$('reader-more').querySelector('summary'):$('show-notes')).focus({preventScroll:true});}});
 nodeMotionId=null;$('view-title').setAttribute('aria-hidden','true');$('view-title').tabIndex=-1;
 bindPathLinks();document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{const target=document.querySelector('.'+b.dataset.jump);target.scrollIntoView({block:'start',behavior:'instant'});const heading=target.querySelector('h1,h2,h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}else target.focus({preventScroll:true});});
 document.querySelectorAll('[data-depth]').forEach(b=>b.onclick=()=>{S.depth=Number(b.dataset.depth);rebuild();pushRoute(true);document.querySelector(`[data-depth="${S.depth}"]`).focus({preventScroll:true});});
 $('path-network').onclick=()=>setView('neighbors',n.id);assignUiKeys();
}
function renderThoughtReader(n){
 $('view-title').innerHTML=mathText(n.name);$('view-count').textContent='';$('breadcrumb').textContent='数学思想 · 跨章节联系';
 $('learning-path').innerHTML=ThoughtPresentation.reader(n)+'<details id="reader-reference" class="reader-reference" hidden><summary>个人标记</summary><div id="reader-reference-slot"></div></details>';
 detail(n.id,true);$('reader-reference-slot').append($('detail'));$('view-title').setAttribute('aria-hidden','true');
 $('path-network').onclick=()=>setView('neighbors',n.id);assignUiKeys();
}
const RELATIONS={CURRICULUM_LOCATION:'教材目录路径',ILLUSTRATES_THOUGHT:'知识 → 体现思想',GUIDES_METHOD:'思想 → 指导方法',USES_PROCESS:'运用思维过程',EXPLORES_KNOWLEDGE:'思维过程 → 研究知识',PREREQUISITE_OF:'前置准备 → 后续知识',USES_KNOWLEDGE:'方法 → 用到的知识',SOLVED_BY:'任务 → 解题方法',CONTAINS:'教材 / 章节归属',TEACHES:'课节 → 知识',RELATED_TO:'一般关联',PARALLEL_WITH:'并列联系',POSSIBLE_OVERLAP:'待辨析联系',EMPHASIZES:'素养 → 主题目标',LEARNING_ENTRY:'素养 → 教材入口',CO_DEVELOPS:'素养协同',INCLUDES_METHOD:'主题 → 相关方法',SPECIALIZES_TO:'方法家族 → 具体方法',DEVELOPS_THROUGH:'素养 → 教学设计关联',SUPPORTS:'知识 / 方法支持',COMPETENCY_TAG:'素养标签'};
const RELATION_HELP={
 CURRICULUM_LOCATION:'按已有教材归属连接可见目录层级；展开说明可查看所经过的原始条目。它表示位置，不能用来判断先修或学习达成。',
 ILLUSTRATES_THOUGHT:'此知识的学习或应用体现该思想；具体联系见依据。',
 GUIDES_METHOD:'该方法体现这一思想；一个方法可以体现多种思想。',
 USES_PROCESS:'学习或研究时运用这一思维过程。',
 EXPLORES_KNOWLEDGE:'用这一思维过程探索知识及其联系。',
 PREREQUISITE_OF:'箭头始终由准备知识指向后续知识；回看前置不会反转方向。必要程度保留原记录。',
 USES_KNOWLEDGE:'方法实施用到这些知识；方法使用与必要先修分别记录。',
 SOLVED_BY:'该知识或任务可调用这个方法；能否使用仍取决于任务条件。',
 CONTAINS:'教材、章节和主题的归属层级，不表示前置或学习完成。',
 TEACHES:'按课程标题定位到知识内容，保留原始目录与标题对应。',
 RELATED_TO:'原记录的一般关联，不构成前置判断。',
 PARALLEL_WITH:'并列对象的横向联系，无准备到后续的方向。',
 POSSIBLE_OVERLAP:'对象可能重叠，保留待辨析状态。',
 EMPHASIZES:'课标主题的整体素养目标，保留主题层面的依据。',
 LEARNING_ENTRY:'从素养进入教材的导航入口。',
 CO_DEVELOPS:'素养之间的协同联系，无前置方向。',
 INCLUDES_METHOD:'主题下记录的相关方法，属于主题与方法的对应。',
 SPECIALIZES_TO:'从方法家族细化到具体方法，不自动视为必要先修。',
 DEVELOPS_THROUGH:'编辑整理的教学设计与素养关联，不表示素养达成度。',
 SUPPORTS:'原记录的支持关系，具体理由与状态按原记录保留。',
 COMPETENCY_TAG:'素养标签用于分类与筛选；来源仍区分主题、编辑对应和个人标注。'
};
function hitEdge(x,y){let best=null,distance=6;const f=graphFocus();for(const e of L){if(edgeVisual(e,f)<.12)continue;const a=P.get(e.source),b=P.get(e.target);if(!a||!b)continue;const points=edgePoints(e),ax=points.a.x,ay=points.a.y,bx=points.b.x,by=points.b.y,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-ax-t*dx,y-ay-t*dy);if(d<distance){best=e;distance=d;}}return best;}
function closeEdge(restore=true){
 const panel=$('edge-inspector'),was=!panel.hidden;panel.hidden=true;panel.removeAttribute('data-selected');inspectedEdgeId=null;releaseOverlay('edge');document.querySelectorAll('[data-edge-id][data-selected]').forEach(b=>b.removeAttribute('data-selected'));highlight();
 if(was&&restore){const caller=edgeCaller?.isConnected&&edgeCaller.getClientRects().length&&!edgeCaller.closest('[inert]')?edgeCaller:canvas;caller.focus({preventScroll:true});}if(was)draw();
}
function showEdge(e,caller=document.activeElement){
 closeGraphPanel(false);edgeCaller=caller;inspectedEdgeId=e.id;activateOverlay('edge');const panel=$('edge-inspector');panel.hidden=false;panel.dataset.selected='true';panel.dataset.evidenceStatus=e.status;panel.setAttribute('aria-label','所选关系说明：'+(RELATIONS[e.type]||'已记录关系'));
 panel.innerHTML=`<button id="edge-close" aria-label="关闭关系说明">关闭</button><b>${esc(RELATIONS[e.type]||'已记录关系')}</b><p>${edgeDirection(e)}</p><p class="relation-state">${esc(evidenceStatus(e))}</p><p>${reasonHTML(e)}</p><p>${esc(RELATION_HELP[e.type]||'按原记录显示关系。')}</p><details data-ui-key="inspect:${esc(e.id)}"><summary>查看关系依据</summary>${e.type==='COMPETENCY_TAG'?competencyEvidence(byId(e.target),e.source):evidenceBlock(e)}</details><div><button data-edge-node="${e.source}" data-node-type="${byId(e.source).type}">查看${mathText(byId(e.source).name)}</button><button data-edge-node="${e.target}" data-node-type="${byId(e.target).type}">查看${mathText(byId(e.target).name)}</button></div>`;
 $('edge-close').onclick=()=>closeEdge();panel.querySelectorAll('[data-edge-node]').forEach(b=>b.onclick=()=>{choose(b.dataset.edgeNode,true);($('reader-title')||$('view-title')).focus({preventScroll:true});});
 document.querySelectorAll('[data-edge-id]').forEach(b=>{if(b.dataset.edgeId===e.id)b.dataset.selected='true';else b.removeAttribute('data-selected');});selectedEdges=new Set([e.id]);selectedNeighbors=new Set([e.source,e.target]);draw();$('edge-close').focus({preventScroll:true});
}
function renderGraphRelations(){
 const edges=S.selected?L.filter(e=>e.source===S.selected||e.target===S.selected):[];
 $('graph-relations').innerHTML=`<summary>当前节点的关系 · ${edges.length} 条</summary>${edges.length?edges.map(e=>`<button data-edge-id="${esc(e.id)}" data-evidence-status="${e.status}"><span>${esc(RELATIONS[e.type]||'已记录关系')}</span>${edgeDirection(e)}<small>${esc(evidenceStatus(e))}</small></button>`).join(''):'<p>先搜索或选择一个节点，即可用列表阅读图中关系。</p>'}`;
 document.querySelectorAll('[data-edge-id]').forEach(b=>{b.onclick=()=>{const e=L.find(e=>e.id===b.dataset.edgeId);if(e)showEdge(e,b);};});
}
function bindPathLinks(){document.querySelectorAll('[data-path-node]').forEach(b=>b.onclick=()=>{choose(b.dataset.pathNode,true,b.dataset.explorationStart?'directory':'relation');($('reader-title')||$('view-title')).focus({preventScroll:true});});}
function dialogTabStops(dialog){
 return [...dialog.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')].filter(el=>{
  if(el.disabled||el.tabIndex<0||el.closest('[hidden],[inert]')||!el.getClientRects().length||getComputedStyle(el).visibility!=='visible')return false;
  // Closed details may retain layout boxes; only their summary is tabbable.
  for(let parent=el.parentElement;parent&&parent!==dialog;parent=parent.parentElement){
   if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(el))return false;
  }
  return true;
 });
}
function topOverlay(){return overlayStack.at(-1);}
function closeTopOverlay(){
 const top=topOverlay();if(top==='search'){closeSearch();$('search').focus({preventScroll:true});}
 else if(top==='reader')closeReader();else if(top==='graph-panel')closeGraphPanel();else if(top==='edge')closeEdge();else if(top==='notes')closeNotes();else if(top==='catalog')closeCatalog();
 else if(top==='files'){const menu=document.querySelector('.file-menu');menu.open=false;releaseOverlay('files');menu.querySelector('summary').focus({preventScroll:true});}
 return !!top;
}

// Capture the outgoing screen before any navigation or rebuild handler runs.
document.addEventListener('click',rememberUI,true);
document.addEventListener('keydown',e=>{inputKind='keyboard';document.documentElement.dataset.input='keyboard';if(e.key==='Enter'||e.key===' ')rememberUI();},true);
document.addEventListener('pointerdown',()=>{inputKind='pointer';document.documentElement.dataset.input='pointer';},true);
let saveFrame=0;document.addEventListener('scroll',()=>{cancelAnimationFrame(saveFrame);saveFrame=requestAnimationFrame(rememberUI);},true);
document.addEventListener('click',e=>{
 const summary=e.target.closest('summary'),details=summary?.parentElement;if(!details||details.tagName!=='DETAILS')return;
 if(details.classList.contains('file-menu')){if(!details.open)activateOverlay('files');else releaseOverlay('files');}
 const body=details.querySelector(':scope > .evidence-body');if(body){if(!details.open)body.dataset.motion='evidence';else body.removeAttribute('data-motion');}
});
document.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS'){if(e.target.classList.contains('file-menu')){if(e.target.open)activateOverlay('files');else releaseOverlay('files');}rememberUI();}},true);
$('search').oninput=searchResults;
const searchButtons=()=>$('results').hidden?[]:[...$('results').querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);
$('search').onkeydown=e=>{const first=searchButtons()[0];if(first&&['ArrowDown','Enter'].includes(e.key)){e.preventDefault();e.key==='Enter'?first.click():first.focus();}};
$('results').onkeydown=e=>{const bs=searchButtons(),i=bs.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)&&bs.length){e.preventDefault();bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length].focus();}};
document.addEventListener('click',e=>{if(!e.target.closest('.search-area'))closeSearch();});
document.addEventListener('keydown',e=>{
 if(window.TextbookReader?.isOpen())return;
 const editing=document.activeElement.matches('input,textarea,[contenteditable="true"]');if(e.key==='/'&&!editing){e.preventDefault();$('search').focus();}
 if(e.key==='Escape'){if(closeTopOverlay()){e.preventDefault();e.stopPropagation();}else if(graphFocusMode){e.preventDefault();setGraphFocusMode(false);$('graph-focus-toggle').focus({preventScroll:true});}else if(S.mode!=='path'&&(S.selected||graphHover)&&!editing){e.preventDefault();$('graph-clear').click();canvas.focus({preventScroll:true});}}
 if(e.key.toLowerCase()==='f'&&!editing&&(document.activeElement===canvas||document.activeElement.closest('#hierarchy-view'))){e.preventDefault();setGraphFocusMode(!graphFocusMode);}
 const dialog=document.querySelector('[aria-modal="true"]');if(e.key==='Tab'&&dialog){const els=dialogTabStops(dialog),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
for(const [id,key]of [['show-related','related'],['show-lessons','lessons'],['show-methods','methods'],['show-thoughts','thoughts']])$(id).onchange=e=>{S[key]=e.target.checked;rebuild();pushRoute(true);};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{S.layout='layers';setView(b.dataset.view);});$('chain').onclick=()=>isReadableNode(byId(S.selected))?choose(S.selected,true):setView('path');
$('graph-back').onclick=()=>history.back();
function switchGraphLayout(){
 rememberUI();closeGraphPanel(false);
 // The two views are workspaces: switching back restores the view that was left.
 const current=isHierarchy()?'layers':'free',next=current==='layers'?'free':'layers';
 graphModeVisits.set(current,{state:{...S,facets:[...S.facets]},ui:captureUI(),startId});
 const previous=graphModeVisits.get(next);
 if(previous){Object.assign(S,previous.state,{facets:[...previous.state.facets]});startId=previous.startId;}
 else{
  S.layout=next;S.mode='all';S.scope=null;
  if(next==='layers'){
   const id=S.selected;if(id)hierarchySelection=hierarchyModel.locate(id,hierarchySelection);
   S.related=false;S.lessons=false;S.hideUnrelated=false;
  }else{
   // First full-network visit includes every category; filters can be applied afterwards.
   S.selected=null;S.facet=null;S.facets=[];S.bookFilter=null;S.related=true;S.lessons=true;S.methods=true;S.hideUnrelated=false;S.spacing=1;
   document.querySelector('.app').classList.add('catalog-collapsed');$('catalog-layout-toggle').setAttribute('aria-expanded','false');$('catalog-layout-toggle').setAttribute('aria-label','展开教材目录');
  }
 }
 graphPinned=S.selected;graphHover=null;renderedScope=null;rebuild();
 if(previous)restoreUI({...previous.ui,focus:null});
 for(const [id,key]of [['show-related','related'],['show-lessons','lessons'],['show-methods','methods'],['show-thoughts','thoughts']])$(id).checked=S[key];
 $('graph-layout-toggle').focus({preventScroll:true});pushRoute();
 graphModeAnimation?.cancel();
 if(!graphReduced.matches&&inputKind!=='keyboard')graphModeAnimation=(isHierarchy()?$('hierarchy-view'):wrap).animate([{opacity:.55},{opacity:1}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
}
$('graph-layout-toggle').onclick=switchGraphLayout;
$('graph-global').onclick=()=>{
 rememberUI();S.layout='free';S.facet=null;S.facets=[];S.bookFilter=null;S.related=true;S.lessons=true;S.methods=true;S.hideUnrelated=false;S.spacing=1;
 setView('all');
 for(const [id,key]of [['show-related','related'],['show-lessons','lessons'],['show-methods','methods'],['show-thoughts','thoughts']])$(id).checked=S[key];
 $('graph-focus-title').focus({preventScroll:true});
};
for(const name of ['scope','display','relations'])$('graph-'+name+'-toggle').onclick=()=>toggleGraphPanel(name);
document.querySelectorAll('[data-graph-panel-close]').forEach(b=>b.onclick=()=>closeGraphPanel());
$('graph-focus-toggle').onclick=()=>setGraphFocusMode(!graphFocusMode);
$('catalog-layout-toggle').onclick=toggleCatalogLayout;
$('graph-catalog').onclick=()=>{closeGraphPanel(false);if(isHierarchy()){hierarchyView.advance(0,{focus:true});return;}if(graphFocusMode)setGraphFocusMode(false);if(document.querySelector('.app').classList.contains('catalog-collapsed'))toggleCatalogLayout();if(narrow())openCatalog();else document.querySelector('[data-core]')?.focus();};
document.addEventListener('click',e=>{if(graphPanel&&!e.composedPath().some(el=>el.matches?.('.graph-popover,[id$="-toggle"]')))closeGraphPanel(false);});
$('graph-spacing').addEventListener('pointerdown',rememberUI);$('graph-spacing').addEventListener('keydown',rememberUI);$('graph-spacing').oninput=e=>setGraphSpacing(Number(e.target.value)/100);$('graph-spacing').onchange=()=>pushRoute();
$('graph-color').onchange=e=>{S.colorBy=e.target.value;updateGraphControls();draw();pushRoute(true);};
$('graph-isolate').onclick=()=>{S.hideUnrelated=!S.hideUnrelated;graphMotionAt=performance.now();updateGraphControls();draw();pushRoute(true);};
$('graph-local').onclick=()=>{if(S.selected)setView('neighbors',S.selected);};
$('graph-read').onclick=()=>{if(S.selected)choose(S.selected,true);};
$('graph-clear').onclick=()=>{graphPinned=null;graphHover=null;S.selected=null;closeEdge(false);closeNotes(false);summary();updateGraphControls();renderGraphRelations();pushRoute(true);};
graphReduced.addEventListener('change',()=>{if(graphCameraMotion)camera={...graphCameraMotion.to};graphCameraMotion=null;graphAlpha.clear();draw();});
canvas.onkeydown=e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?.8:1.25);return;}if(e.key==='Enter'&&graphHover){e.preventDefault();choose(graphHover,false,'graph');return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const from=P.get(graphHover||S.selected)||{x:0,y:0},dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0,f=graphFocus();const next=[...P.values()].filter(p=>p!==from&&nodeVisual(p.n,f)>0&&(p.x-from.x)*dx+(p.y-from.y)*dy>0).sort((a,b)=>(Math.hypot(a.x-from.x,a.y-from.y)+2*Math.abs((a.x-from.x)*dy-(a.y-from.y)*dx))-(Math.hypot(b.x-from.x,b.y-from.y)+2*Math.abs((b.x-from.x)*dy-(b.y-from.y)*dx)))[0];if(next){graphHover=next.n.id;$('graph-focus-title').innerHTML='预览 · '+mathText(next.n.name);$('graph-focus-title').title=$('graph-focus-title').textContent;draw();}};
$('reset').onclick=()=>{rememberUI();setGraphSpacing(1);fit(true);pushRoute(true);};$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);$('clear').onclick=()=>closeNotes();
$('journey-start').onclick=()=>{if(startId)choose(startId,true);($('reader-title')||$('view-title')).focus({preventScroll:true});};
$('nav-toggle').onclick=()=>{if(isHierarchy()){hierarchyView.advance(1,{focus:true});return;}if(graphFocusMode)setGraphFocusMode(false);if(document.querySelector('.app').classList.contains('catalog-collapsed'))toggleCatalogLayout();document.querySelector('.left').classList.contains('open')?closeCatalog():openCatalog();};
$('reader-personal').onclick=()=>{$('reader-more').open=false;openNotes();};
$('reader-more').addEventListener('keydown',e=>{if(e.key==='Escape'&&$('reader-more').open){e.preventDefault();e.stopPropagation();$('reader-more').open=false;$('reader-more').querySelector('summary').focus();}});
document.addEventListener('click',e=>{if(!$('reader-more').contains(e.target))$('reader-more').open=false;});
$('catalog-close').onclick=()=>closeCatalog();$('nav-backdrop').onclick=()=>closeCatalog();$('show-notes').onclick=()=>document.querySelector('.right').classList.contains('open')?closeNotes():openNotes();$('go-back').onclick=()=>history.back();
window.addEventListener('resize',updateOverlay);window.addEventListener('popstate',e=>{routeIndex=e.state?.index||0;entryKey=e.state?.entryKey||crypto.randomUUID();startId=e.state?.startId??null;readRoute(visits.get(entryKey)||e.state?.ui);});
$('download').onclick=()=>{const blob=new Blob([JSON.stringify({...G,userAnnotations:annotations,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='高中数学知识网络-含本地标签.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import-tags').onclick=()=>$('tag-file').click();$('tag-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data.userAnnotations||typeof data.userAnnotations!=='object')throw Error('请选择本图谱导出的 JSON 文件');let count=0;for(const [id,v]of Object.entries(data.userAnnotations)){if(!N.has(id)||!v||typeof v!=='object')continue;const clean={};if(Array.isArray(v.competencyIds))clean.competencyIds=[...new Set(v.competencyIds.filter(c=>comps.some(n=>n.id===c)))];if(Array.isArray(v.tags))clean.tags=[...new Set(v.tags.filter(t=>typeof t==='string').map(t=>t.trim().slice(0,40)).filter(Boolean))];annotations[id]={...annotations[id],...clean};count++;}localStorage.setItem(ANNOTATION_KEY,JSON.stringify(annotations));rebuild();$('status-text').textContent='已导入 '+count+' 个节点的标签。';}catch(err){$('status-text').textContent='标签未导入：'+err.message;}e.target.value='';};
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main').focus();};$('view-title').tabIndex=-1;$('total').textContent=`${G.nodes.length} 原ID · ${displayRows(G.nodes).length} 个显示入口 · ${G.edges.length.toLocaleString()} 联系`;
$('relation-legend').innerHTML=Object.keys(G.metadata.counts.edgeTypes).map(type=>`<dt>${esc(RELATIONS[type])}</dt><dd>${esc(RELATION_HELP[type])}</dd>`).join('');
function openReader(id,origin='relation'){
 id=displayId(id);
 if(!isReadableNode(byId(id)))return;
 rememberUI();if(readerId===id)return;
 if(readerId)readerTrail.push(readerId);else{readerCaller=document.activeElement;readerTrail=[];}
 readerId=id;if(origin==='search'||origin==='directory')startId=id;
 closeSearch();closeGraphPanel(false);closeEdge(false);closeNotes(false);closeCatalog(false);
 renderJourney();$('learning-path').scrollTop=0;pushRoute();$('reader-title')?.focus({preventScroll:true});
}
function closeReader(){
 if(!readerId)return;rememberUI();readerId=null;readerTrail=[];releaseOverlay('reader');renderJourney();pushRoute();
 const target=readerCaller?.isConnected&&readerCaller.getClientRects().length?readerCaller:$('graph-focus-title');target.tabIndex=target.tabIndex<0?-1:target.tabIndex;target.focus({preventScroll:true});
}
$('reader-close').onclick=closeReader;$('reader-backdrop').onclick=closeReader;$('reader-back').onclick=()=>history.back();
$('reader-expand').onclick=()=>{if(!readerId)return;const ui=captureUI(),id=readerId;setView('path',id);const opened=new Set(ui.open||[]);document.querySelectorAll('details[data-ui-key]').forEach(d=>d.open=opened.has(d.dataset.uiKey));if($('reader-reference'))$('reader-reference').hidden=!$('reader-reference').open;$('learning-path').scrollTop=ui.pathScroll||0;$('reader-title')?.focus({preventScroll:true});rememberUI();};
function renderHierarchy(){
 if(!hierarchyView)return;
 const projection=hierarchyModel.project(hierarchySelection,{facets:S.facets,bookFilter:S.bookFilter,methods:S.methods,thoughts:S.thoughts});hierarchySelection=projection.selection;
 S.selected=projection.selectedMethod?.id||projection.selectedKnowledge?.id||null;
 hierarchyView.render(projection,{methods:S.methods,thoughts:S.thoughts});updateGraphControls();document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===S.mode);b.setAttribute('aria-pressed',b.dataset.view===S.mode);});$('chain').classList.remove('active');$('chain').setAttribute('aria-pressed','false');
 $('graph-focus-title').textContent='分层知识网络';$('graph-focus-title').title='分层知识网络';$('graph-subtitle').textContent='素养 → 教材 → 章节 → 知识 → 方法 · 思想横向联系';
}
function selectHierarchy(stage,id){
 rememberUI();closeGraphPanel(false);
 if(stage===0){S.facets=S.facets.includes(id)?S.facets.filter(v=>v!==id):[...S.facets,id];S.facet=S.facets[0]||null;hierarchySelection.knowledgeId=null;hierarchySelection.methodId=null;}
 if(stage===1){S.bookFilter=null;hierarchySelection=hierarchyModel.locate(id,hierarchySelection);}
 if(stage===2)hierarchySelection=hierarchyModel.locate(id,hierarchySelection);
 if(stage===3){hierarchySelection.knowledgeId=id;hierarchySelection.methodId=null;}
 if(stage===4)hierarchySelection.methodId=id;
 if(stage===5)hierarchySelection.thoughtId=hierarchySelection.thoughtId===id?null:id;
 S.mode='all';S.scope=null;renderHierarchy();renderBooks();renderFilterSummary();pushRoute();if(stage===4){openReader(id);readerCaller=document.querySelector(`[data-hierarchy-node="${CSS.escape(id)}"]`);}
}
hierarchyView=HierarchyView.mount($('hierarchy-view'),{
 onSelect:selectHierarchy,onQuery:value=>{hierarchySelection.query=value;renderHierarchy();rememberUI();},
 onExplore:id=>setView('neighbors',id),onRead:id=>choose(id,true),
 onClear:()=>{rememberUI();hierarchySelection.knowledgeId=null;hierarchySelection.methodId=null;renderHierarchy();pushRoute();}
});
readRoute(history.state?.ui);history.replaceState({mathNetwork:true,index:routeIndex,entryKey,startId,ui:captureUI()},'',routeHash());updateOverlay();

window.addEventListener("r80-node-ready",event=>{if((readerId||S.scope)===displayId(event.detail.id)){const ui=captureUI();renderJourney();restoreUI(ui);}});

/* Preserve the existing managed route/UI entry for an explicit return to a source relation. */
window.KnowledgeReaderNavigation={
 capture:()=>({hash:location.hash,ui:captureUI(),startId,entryKey,routeIndex,nodeId:readerId||S.scope||S.selected}),
 remember:rememberUI,
 restore:context=>new Promise((resolve,reject)=>{
  let settled=false,timer;const remove=()=>{clearTimeout(timer);window.removeEventListener('popstate',returned);};
  const finish=async()=>{if(settled)return;settled=true;remove();try{if(context.nodeId)await window.R80Reader.ensure(context.nodeId);restoreUI(context.ui);rememberUI();resolve();}catch(error){reject(error);}};
  const explicit=()=>{if(settled)return;remove();rememberUI();routeIndex++;entryKey=crypto.randomUUID();startId=context.startId;history.pushState({mathNetwork:true,index:routeIndex,entryKey,startId,ui:context.ui},'',context.hash);readRoute(context.ui);finish();};
  const returned=()=>{if(history.state?.entryKey===context.entryKey&&location.hash===context.hash)finish();else explicit();};
  if(!context||(context.nodeId&&!byId(context.nodeId))){reject(Error('原节点尚未对应'));return;}
  const distance=routeIndex-context.routeIndex;
  if(history.state?.mathNetwork&&Number.isInteger(distance)&&distance>0&&context.entryKey){visits.set(context.entryKey,context.ui);window.addEventListener('popstate',returned);timer=setTimeout(explicit,1200);history.go(-distance);}else explicit();
 })
};

window.addEventListener("r80-read-chapter",event=>{if(byId(event.detail.id)?.type==="CHAPTER")setView("chapter",event.detail.id,"directory");});
window.addEventListener("r80-read-node",event=>{if(byId(event.detail.id))choose(event.detail.id,true,"relation");});

// Return to the same knowledge entry in its recorded textbook/chapter scope.
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-curriculum-locate]');if(!button)return;
 const id=button.dataset.curriculumLocate;if(byId(id)?.type!=='KNOWLEDGE')return;
 S.bookFilter=null;S.facets=[];S.facet=null;S.layout='layers';
 S.selected=id;
 hierarchySelection=hierarchyModel.locate(id,{...hierarchySelection,bookId:button.dataset.curriculumBook||null,chapterId:button.dataset.curriculumChapter||null});
 setView('all');choose(id,false,'directory');closeNotes(false);
 hierarchyView.advance(3,{focus:true});rememberUI();
});
