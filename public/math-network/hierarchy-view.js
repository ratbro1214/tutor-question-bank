(function(root){
 'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const titles=['核心素养','教材','章节','知识点','解题方法'];
 const colors=['#9A527D','#527DB5','#478B85','#B18343','#8263AA'];
 function mount(host,{onSelect,onQuery,onExplore,onRead,onClear}){
  let view=null,frame=0,hoverId=null,config={},lastChapter=null,lastBook=null,lastQuery='',lastKnowledge=null;const wireElements=new Map();
  host.innerHTML=`<nav class="hierarchy-steps" aria-label="知识层级">${titles.map((t,i)=>`<button data-layer-step="${i}" aria-label="定位${t}列"><span>0${i+1}</span>${t}</button>`).join('')}</nav><div class="hierarchy-viewport"><div class="hierarchy-board"><svg class="hierarchy-wires" aria-hidden="true"></svg><aside class="hierarchy-thought-band" aria-label="贯穿知识与方法的数学思想"></aside>${titles.map((title,i)=>`<section class="hierarchy-column" data-layer="${i}" style="--layer-color:${colors[i]}" aria-label="${title}"><div class="hierarchy-column-head"><span class="hierarchy-index">0${i+1}</span><div><h2>${title}<small></small></h2><p></p></div></div>${i===3?'<div class="hierarchy-find"><span aria-hidden="true">⌕</span><input aria-label="筛选本章知识点" placeholder="在本章中查找" autocomplete="off"><button aria-label="清除本章查找" hidden>×</button></div>':''}<div class="hierarchy-list" tabindex="-1"></div><div class="hierarchy-column-foot"></div></section>`).join('')}</div></div><div class="hierarchy-footer"><div class="hierarchy-selection"><strong>从左向右，展开一条知识脉络</strong><span>素养统领课程；教材与章节组织知识；思想横向关联，方法按知识展开。</span></div><div class="hierarchy-actions" hidden><button data-hierarchy-explore>聚焦前后置</button><button data-hierarchy-read>知识详解</button><button data-hierarchy-clear aria-label="取消知识选择">×</button></div></div>`;
  const viewport=host.querySelector('.hierarchy-viewport'),board=host.querySelector('.hierarchy-board'),svg=host.querySelector('svg'),columns=[...host.querySelectorAll('.hierarchy-column')],input=host.querySelector('input');
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  function card(n,stage,{selected=false,count=null,sub='',faded=false}={}){
   const numeral=count===null?'':`<span class="hierarchy-card-count">${count}</span>`;
   return `<button class="hierarchy-node${selected?' selected':''}${faded?' subdued':''}" data-hierarchy-node="${escape(n.id)}" data-stage="${stage}" aria-pressed="${selected}" title="${escape(n.name)}"><i class="hierarchy-port" aria-hidden="true"></i><span class="hierarchy-node-text"><b>${root.TextbookReader?.text(n.name)||escape(n.name)}</b>${sub?`<small>${escape(sub)}</small>`:''}</span>${numeral}<i class="hierarchy-port out" aria-hidden="true"></i></button>`;
  }
  const empty=text=>`<div class="hierarchy-empty"><span aria-hidden="true">· · ·</span><p>${escape(text)}</p></div>`;
  function knowledgeCards(next,k){
   const drawn=new Set(),groups=next.organizationGroups||[];
   const row=n=>card(n,3,{selected:n.id===k?.id,sub:next.placementLabels?.[n.id]||(n.chapterIds.length>1?'跨章节知识':''),faded:next.thoughtMatches?!next.thoughtMatches.has(n.id):!!k&&n.id!==k.id});
   return next.knowledge.map(n=>{const g=groups.find(g=>g.members.includes(n.id));if(!g)return row(n);if(drawn.has(g.id))return '';drawn.add(g.id);return '<section class="hierarchy-organization" data-organization="'+escape(g.id)+'"><h3>'+(g.id==='kp:21169'?'<button type="button" data-method-node="'+escape(g.id)+'" data-ui-key="S34-organization:'+escape(g.id)+'">'+escape(g.name)+' · 组织入口</button>':escape(g.name))+'</h3>'+g.nodes.map(row).join('')+'</section>';}).join('');
  }
  function methodCards(next,m,k,options,additionalOpen){
   if(options.methods===false)return empty('方法显示已关闭，可在图例与显示中开启。');
   const group=(title,html)=>html?'<section class="hierarchy-method-group"><h3>'+title+'</h3>'+html+'</section>':'';

   const methods=next.methods.map(n=>{const links=next.links.filter(l=>l.methodId===n.id),uses=links.some(l=>l.kind==='uses'),solve=links.some(l=>l.kind==='solve');return card(n,4,{selected:n.id===m?.id,sub:k?(solve&&uses?'解题可用 · 也使用此知识':solve?'解题可用':'使用此知识'):(n.type==='SKILL'?'应用能力':new Set(links.map(l=>l.knowledgeId)).size+' 个知识点联系'),faded:next.thoughtMatches?!next.thoughtMatches.has(n.id):!!m&&n.id!==m.id});}).join('');
   const families=(next.families||[]).map(n=>card(n,4,{selected:n.id===m?.id,sub:'方法族 · 查看已有分支'})).join('');
   const apps=[...new Map((next.knowledgeApplications||[]).map(a=>[a.id,a])).values()].map(a=>{const cid=a.primaryContentId||a.references?.[0]?.contentId;return cid?'<button type="button" class="hierarchy-node" data-method-reference="'+escape(cid)+'" data-method-application-search="'+escape(a.id)+'" data-ui-key="S34-hierarchy-application:'+escape(a.id)+'"><span class="hierarchy-node-text"><b>'+root.TextbookReader.text(a.name)+'</b><small>'+escape(a.decisionDisplayRole||'知识应用 · 原候选身份保留')+'</small></span></button>':'';}).join('');
   const additional=next.additionalMethods.length?'<details class="hierarchy-additional" '+(additionalOpen||next.additionalMethods.some(n=>n.id===m?.id)?'open':'')+'><summary>本章其他方法与能力 <span>'+next.additionalMethods.length+'</span></summary><p>按章节归属列出，未与上列知识点直接连线。</p>'+next.additionalMethods.map(n=>card(n,4,{selected:n.id===m?.id,sub:n.type==='SKILL'?'应用能力':'章节关联方法'})).join('')+'</details>':'';
   return '<button type="button" class="hierarchy-nav-index" data-method-navigation-index data-ui-key="S34-navigation-index">浏览全部思想与方法 →</button>'+group('具体方法与能力',methods)+group('相关方法族',families)+group('知识下的证明与应用',apps)+(!methods&&!families&&!apps?empty(k?'此知识点尚未记录直接方法联系。':'本章尚未记录直接方法联系。'):'')+additional;
  }
  function thoughtBand(next,options){
   const band=host.querySelector('.hierarchy-thought-band');band.hidden=options.thoughts===false;
   if(band.hidden)return;
   const current=next.selectedThought;
   band.innerHTML='<div class="thought-band-heading"><b>数学思想</b><span>横向联系知识与方法</span>'+(current?'<button type="button" data-thought-read="'+escape(current.id)+'">跨章节查看 →</button>':'')+'</div><div class="thought-band-choices">'+next.thoughts.map(r=>'<button type="button" data-thought-focus="'+escape(r.node.id)+'" aria-pressed="'+(r.node.id===current?.id)+'" class="'+(r.count?'has-links':'')+'" title="直接体现 '+r.directCount+' 个知识点；通过方法联系 '+r.viaCount+' 个知识点"><b>'+escape(r.node.name)+'</b><small>'+(r.count?[r.directCount?r.directCount+' 直接':'',r.viaCount?r.viaCount+' 经方法':''].filter(Boolean).join(' · '):'暂无当前联系')+'</small></button>').join('')+'</div><p class="thought-band-note">'+(current?'已突出「'+escape(current.name)+'」联系的知识与方法。再点一次恢复全部。':'选择思想，突出当前知识范围内的联系；可继续跨章节查看。')+'</p>';
  }
  function render(next,options={}){
   const additionalOpen=host.querySelector('.hierarchy-additional')?.open;const priorScroll=columns.map(c=>c.querySelector('.hierarchy-list').scrollTop);view=next;config=options;hoverId=null;
   const k=next.selectedKnowledge,m=next.selectedMethod;thoughtBand(next,options);
   const fragments=[
    next.cores.map(r=>card(r.node,0,{selected:next.selectedFacets.includes(r.node.id),count:r.count,sub:r.rawCount!==r.count?r.count+'个显示入口 · '+r.rawCount+'条原关联':'',faded:next.selectedFacets.length&&!next.selectedFacets.includes(r.node.id)})).join(''),
    next.books.map(r=>card(r.node,1,{selected:r.node.id===next.book?.id,count:null,sub:next.selectedFacets.length?`匹配 ${r.count} / 全册 ${r.total}`:`${r.total} 个知识点`,faded:r.count===0})).join(''),
    next.chapters.map(r=>card(r.node,2,{selected:r.node.id===next.chapter?.id,count:r.count,faded:r.count===0})).join(''),
    knowledgeCards(next,k)||empty(next.selection.query?'本章没有匹配名称。清除查找可查看全部。':'当前素养筛选下，本章没有匹配知识点。'),
    methodCards(next,m,k,options,additionalOpen)
   ];
   const subtitles=[next.selectedFacets.length?'符合任一已选素养':'可多选 · 符合任一项','选择一本教材',next.book?.name||'选择教材',next.chapter?.name||'选择章节',k?'与「'+k.name+'」的已有联系':'本章已有联系 · 选择知识可收拢'];
   const counts=[6,next.books.length,next.chapters.length,next.chapterCount,next.methods.length+(next.families?.length||0)+new Set((next.knowledgeApplications||[]).map(a=>a.id)).size];
   columns.forEach((col,i)=>{
    col.querySelector('h2 small').textContent=counts[i];col.querySelector('.hierarchy-column-head p').innerHTML=root.TextbookReader?.text(subtitles[i])||escape(subtitles[i]);
    const list=col.querySelector('.hierarchy-list');list.innerHTML=fragments[i];
    list.scrollTop=(i<2||i===2&&lastBook===next.book?.id||i>=3&&lastChapter===next.chapter?.id)?priorScroll[i]:0;
    col.querySelector('.hierarchy-column-foot').textContent=i===0?'数字为关联知识点数':i===1?'教材目录顺序':i===2?'点击章节展开右侧':i===3?`${next.knowledge.length} / ${next.chapterCount} 项 · 列内滚动查看`:'连线仅表示已有直接方法关系';
   });
   if(k&&(k.id!==lastKnowledge||(!next.selection.query&&lastQuery))){const list=columns[3].querySelector('.hierarchy-list'),chosen=list.querySelector('.selected');if(chosen){const a=chosen.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)list.scrollTop+=a.top-b.top-12;}}
   lastKnowledge=k?.id||null;lastQuery=next.selection.query;input.value=next.selection.query;input.nextElementSibling.hidden=!input.value;
   const selected=m||k,footer=host.querySelector('.hierarchy-selection');
   footer.innerHTML=selected?`<strong>${root.TextbookReader?.text(selected.name)||escape(selected.name)}</strong><span>${m?(m.type==='METHOD_FAMILY'?'方法族 · 查看已有分支':'方法联系保留原类型与方向'):`${next.book.name} / ${next.chapter.name}`} · 查看前后置可进入局部图</span>`:'<strong>从左向右，展开一条知识脉络</strong><span>素养统领课程；教材与章节组织知识；思想横向关联，方法按知识展开。</span>';
   host.querySelector('.hierarchy-actions').hidden=!selected;
   host.dataset.thought=next.selectedThought?.id||'';host.dataset.selected=selected?.id||'';host.dataset.knowledgeCount=next.chapterCount;host.dataset.methodCount=next.methods.length;host.dataset.additionalMethodCount=next.additionalMethods.length;
   lastChapter=next.chapter?.id;lastBook=next.book?.id;schedule();
  }
  function draw(){
   frame=0;if(!view||host.hidden||!host.clientWidth)return;
   const rect=board.getBoundingClientRect(),positions=new Map();
   for(const c of columns){const list=c.querySelector('.hierarchy-list'),clip=list.getBoundingClientRect();for(const n of list.querySelectorAll('[data-hierarchy-node]')){const r=n.getBoundingClientRect();if(r.top+10<clip.top||r.bottom-10>clip.bottom)continue;positions.set(n.dataset.hierarchyNode,{l:r.left-rect.left,r:r.right-rect.left,y:(r.top+r.bottom)/2-rect.top,stage:Number(n.dataset.stage)});}}
   const edges=[],activeCores=view.selectedFacets.length?view.selectedFacets:view.cores.map(r=>r.node.id);
   for(const c of activeCores)for(const b of view.books)if(b.count)edges.push({a:c,b:b.node.id,kind:'navigation',selected:b.node.id===view.book?.id});
   for(const c of view.chapters)edges.push({a:view.book?.id,b:c.node.id,kind:'membership',selected:c.node.id===view.chapter?.id});
   for(const n of view.knowledge)edges.push({a:view.chapter?.id,b:n.id,kind:'membership',selected:n.id===view.selectedKnowledge?.id});
   for(const l of view.links)edges.push({a:l.knowledgeId,b:l.methodId,kind:l.kind,selected:!!view.selectedKnowledge});
   const visible=edges.filter(e=>positions.has(e.a)&&positions.has(e.b));
   svg.setAttribute('width',board.clientWidth);svg.setAttribute('height',board.clientHeight);
   const seen=new Set();
   for(const e of visible){const key=e.a+'|'+e.b+'|'+e.kind;seen.add(key);let path=wireElements.get(key);if(!path){path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('fill','none');svg.append(path);wireElements.set(key,path);}
    const a=positions.get(e.a),b=positions.get(e.b),gap=(b.l-a.r)*.52,emphasis=hoverId?(e.a===hoverId||e.b===hoverId):e.selected;
    path.setAttribute('d',`M${a.r-1},${a.y} C${a.r+gap},${a.y} ${b.l-gap},${b.y} ${b.l+1},${b.y}`);path.setAttribute('stroke',colors[b.stage]);path.setAttribute('stroke-width',emphasis?1.7:1);path.setAttribute('opacity',hoverId?(emphasis?.72:.04):emphasis?.42:.12);path.setAttribute('stroke-dasharray',e.kind==='uses'?'4 4':'none');
   }
   for(const [key,path]of wireElements)if(!seen.has(key)){path.remove();wireElements.delete(key);}
   svg.dataset.visibleConnections=visible.length;
  }
  function advance(stage,{focus=false}={}){
   const target=columns[stage];if(!target)return;
   viewport.scrollTo({left:Math.max(0,target.offsetLeft-16),behavior:'auto'});
   const chosen=target.querySelector('.selected')||target.querySelector('button')||target.querySelector('input');
   if(chosen?.matches('[data-hierarchy-node]')){const list=target.querySelector('.hierarchy-list'),a=chosen.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top+12)list.scrollTop+=a.top-b.top-12;else if(a.bottom>b.bottom-12)list.scrollTop+=a.bottom-b.bottom+12;}
   if(focus)chosen?.focus({preventScroll:true});
   host.querySelectorAll('[data-layer-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.layerStep)===stage?'step':'false'));
   schedule();
  }
  host.addEventListener('click',e=>{
   const thought=e.target.closest('[data-thought-focus]');if(thought){onSelect(5,thought.dataset.thoughtFocus);host.querySelector('[data-thought-focus="'+CSS.escape(thought.dataset.thoughtFocus)+'"]')?.focus({preventScroll:true});return;}
   const thoughtRead=e.target.closest('[data-thought-read]');if(thoughtRead){onRead(thoughtRead.dataset.thoughtRead);return;}
   const node=e.target.closest('[data-hierarchy-node]');
   if(node){const stage=Number(node.dataset.stage),id=node.dataset.hierarchyNode;onSelect(stage,id);if(stage===4)return;host.querySelector(`[data-hierarchy-node="${CSS.escape(id)}"]`)?.focus({preventScroll:true});if(innerWidth<1000&&stage<3)advance(stage+1);return;}
   const step=e.target.closest('[data-layer-step]');if(step){advance(Number(step.dataset.layerStep),{focus:true});return;}
   if(e.target.closest('[data-hierarchy-explore]'))onExplore(view.selectedMethod?.id||view.selectedKnowledge?.id);
   if(e.target.closest('[data-hierarchy-read]'))onRead(view.selectedMethod?.id||view.selectedKnowledge?.id);
   if(e.target.closest('[data-hierarchy-clear]'))onClear();
  });
  input.addEventListener('input',()=>onQuery(input.value));input.nextElementSibling.onclick=()=>{onQuery('');input.focus();};
  host.addEventListener('keydown',e=>{const n=e.target.closest('[data-hierarchy-node]');if(!n)return;const stage=Number(n.dataset.stage);if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();advance(stage+(e.key==='ArrowRight'?1:-1),{focus:true});}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){const items=[...n.parentElement.querySelectorAll('button')],i=items.indexOf(n),next=items[i+(e.key==='ArrowDown'?1:-1)];if(next){e.preventDefault();next.focus();}}});
  host.addEventListener('pointerover',e=>{const id=e.target.closest('[data-hierarchy-node]')?.dataset.hierarchyNode||null;if(id!==hoverId){hoverId=id;schedule();}});
  host.addEventListener('pointerleave',()=>{hoverId=null;schedule();});
  host.addEventListener('focusin',e=>{hoverId=e.target.closest('[data-hierarchy-node]')?.dataset.hierarchyNode||null;schedule();});
  host.addEventListener('toggle',schedule,true);
  for(const col of columns)col.querySelector('.hierarchy-list').addEventListener('scroll',schedule,{passive:true});
  viewport.addEventListener('scroll',schedule,{passive:true});new ResizeObserver(schedule).observe(host);
  return {render,refresh:schedule,advance,capture:()=>({x:viewport.scrollLeft,scroll:columns.map(c=>c.querySelector('.hierarchy-list').scrollTop),query:input.value}),restore(state){if(!state)return;viewport.scrollLeft=state.x||0;columns.forEach((c,i)=>c.querySelector('.hierarchy-list').scrollTop=state.scroll?.[i]||0);schedule();}};
 }
 root.HierarchyView={mount};
})(window);
