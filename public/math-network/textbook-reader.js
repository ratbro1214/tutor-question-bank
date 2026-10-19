/* Independent reading projection. NETWORK is never mutated. */
(function () {
 'use strict';
 const data=window.READING_DATA||{byNodeId:{},anchors:{}};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const articles=id=>data.byNodeId[id]||[];
 const original=data.originalTextbook||{byNodeId:{},excerpts:{}};
 const excerpts=id=>(original.byNodeId[id]||[]).map(key=>original.excerpts[key]);
 const mathOptions={throwOnError:true,trust:false,strict:false,output:'htmlAndMathml'};
 const math=x=>{
  const raw=String(x??''),mapped=data.displayFormulas?.[raw]||window.MATH_DISPLAY_OVERRIDES?.[raw];
  if(mapped||/\\[A-Za-z]+/.test(raw)){
   const tex=mapped||window.MathText.formatTex(raw);
   try{return '<div class="textbook-formula" data-math-source="'+esc(raw)+'" data-latex="'+esc(tex)+'">'+window.katex.renderToString(tex,{...mathOptions,displayMode:true})+'</div>';}
   catch(e){return '<div class="textbook-formula math-render-error" data-math-source="'+esc(raw)+'" title="'+esc(e.message)+'">'+text(raw)+'</div>';}
  }
  return '<div class="textbook-formula textbook-mixed-formula" data-math-source="'+esc(raw)+'">'+text(raw)+'</div>';
 };
 function text(value){
  const raw=String(value??''),parts=data.inlineMath?.[raw]||window.MathText?.parts(raw);
  if(!parts)return esc(raw);
  return parts.map(part=>{
   if(typeof part==='string')return esc(part);
   const tex=window.MathText.formatTex(part.tex);
   try{return `<span class="textbook-inline-math" data-math-source="${esc(part.source)}" data-latex="${esc(tex)}">${window.katex.renderToString(tex,{...mathOptions,displayMode:!!part.display})}</span>`;}
   catch(e){return '<span class="math-render-error" data-math-source="'+esc(part.source)+'" title="'+esc(e.message)+'">'+esc(part.source)+'</span>';}
  }).join('');
 }
 const paragraph=x=>`<p>${text(x)}</p>`;
 const originalText=text;
 const originalBlock=b=>b.math?math(b.math):`<p>${originalText(b.text)}</p>`;
 function overview(id){
  const excerpt=excerpts(id)[0],c=articles(id)[0];
  if(excerpt?.leadBlockIndexes){const example=excerpts(id).find(c=>c.kind==='example');return `<div class="reader-overview textbook-verbatim">${excerpt.leadBlockIndexes.map(i=>originalBlock(excerpt.blocks[i])).join('')}<span class="textbook-copy-origin">定义 · 教材原文</span>${example?`<div class="reader-purpose"><strong>用途与情境</strong>${originalBlock(example.blocks[0])}</div>`:''}</div>`;}
  if(excerpt)return `<div class="reader-overview"><p class="reader-description">${originalText(excerpt.blocks.find(b=>b.text)?.text||'')}</p></div>`;
  if(!c)return '';
  const knowledge=window.NETWORK?.nodes.find(n=>n.id===id)?.type==='KNOWLEDGE';
  return `<div class="reader-overview">${knowledge&&c.formulas?.length?math(c.formulas[0]):''}<p class="reader-description">${text(c.text)}</p><span class="textbook-copy-origin">${c.sourceId?.startsWith('TB-')?'据教材整理':'补充说明'}</span></div>`;
 }
 const list=(title,x,ordered=false)=>x?.length?`<section class="textbook-section"><h3>${title}</h3><${ordered?'ol':'ul'}>${x.map(t=>`<li>${text(t)}</li>`).join('')}</${ordered?'ol':'ul'}></section>`:'';
 function pages(ids){const found=new Map();for(const id of ids){const a=data.anchors[id];if(a){const key=a.sourceId+':'+a.pdfPage;if(!found.has(key))found.set(key,{...a,locations:[]});const locations=found.get(key).locations;if(!locations.includes(a.location))locations.push(a.location);}}return [...found.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)||a.pdfPage-b.pdfPage);}
 function nodePages(id){return pages([...articles(id),...excerpts(id)].flatMap(c=>c.anchorIds||[]));}
 function entry(id){const ps=nodePages(id);if(!ps.length)return '';const a=ps[0];return `<div class="textbook-page-links textbook-entry"><button type="button" data-textbook-node="${esc(id)}" data-textbook-anchor="${esc(a.anchorId)}" ${available?'':'disabled'} title="${available?'查看教材原页':'已记录教材位置；此站点暂未提供原页文件'}">查阅教材</button><span>${esc(a.book)} · 第 ${ps.filter(p=>p.sourceId===a.sourceId).map(p=>esc(p.printedPage)).join('、')} 页${new Set(ps.map(p=>p.sourceId)).size>1?'等':''}</span><small data-textbook-availability>${availabilityKnown&&!available?'教材页暂时无法连接，请刷新后重试':''}</small></div>`;}
 let available=false,availabilityKnown=false;
 function links(nodeId,ids,label='教材原页'){
  const ps=pages(ids);if(!ps.length)return '';
  return `<div class="textbook-page-links" aria-label="${label}"><span>${label}</span>${ps.map(a=>`<button type="button" data-textbook-node="${esc(nodeId)}" data-textbook-anchor="${esc(a.anchorId)}" ${available?'':'disabled'} title="${available?'查看教材原页':'已记录教材位置；此站点暂未提供原页文件'}">${esc(a.book)} · 第 ${esc(a.printedPage)} 页</button>`).join('')}</div>`;
 }
 function articleBody(nodeId,c,omitText=false){
  const m=c.method;
  const formulas=omitText&&window.NETWORK?.nodes.find(n=>n.id===nodeId)?.type==='KNOWLEDGE'?(c.formulas||[]).slice(1):c.formulas||[];
  return `${omitText?'':paragraph(c.text)}${formulas.map(math).join('')}${m?.scope?`<p class="textbook-scope"><strong>适用范围</strong>${text(m.scope)}</p>`:''}${list('使用条件',m?.conditions)}${list('方法步骤',m?.steps,true)}${list('理解与辨析',m?.limits)}${c.example?`<section class="textbook-example"><h3>例题</h3>${paragraph(c.example.question)}${(c.example.formulas||[]).map(math).join('')}${list('解题过程',c.example.solution,true)}</section>`:''}${links(nodeId,c.anchorIds)}${c.contextAnchorIds?.length?`<details class="textbook-context"><summary>延伸阅读</summary>${links(nodeId,c.contextAnchorIds,'相关教材页')}</details>`:''}`;
 }
 function render(nodeId){
  const cs=articles(nodeId);if(!cs.length)return '';
  const verified=excerpts(nodeId);
  if(verified.length)return `<div class="textbook-content textbook-original">${verified.map(c=>{
   const first=pages(c.anchorIds)[0],body=c.sections?c.sections.map(s=>{const content=s.blockIndexes.map(i=>originalBlock(c.blocks[i])).join('');return s.collapsed?`<details class="textbook-article"><summary>${text(s.title)}</summary>${content}</details>`:`<section class="textbook-section"><h3>${text(s.title)}</h3>${content}</section>`;}).join(''):`<h3>${text(c.title)}</h3>${c.blocks.map(originalBlock).join('')}`;
   return `<section class="textbook-verbatim${c.kind==='example'?' textbook-example':''}">${body}<p class="textbook-origin">教材原文 · ${esc(first.book)}第 ${esc(first.printedPage)} 页${c.anchorIds.length>1?'等':''}</p>${links(nodeId,c.anchorIds)}</section>`;
  }).join('')}</div>`;
  return `<div class="textbook-content">${articleBody(nodeId,cs[0],true)}${cs.length>1?`<h3 class="textbook-more-title">更多情境与用法 <span>${cs.length-1}</span></h3>`:''}${cs.slice(1).map((c,i)=>{const first=pages(c.anchorIds)[0],title=c.method?.scope||(first?.section?first.section+' · '+(c.kind==='example'?'例题':'知识说明'):'知识说明');return `<details class="textbook-article" data-ui-key="textbook:${esc(nodeId)}:${i}"><summary>${text(title)}${first?`<small>${esc(first.book)} · 第 ${esc(first.printedPage)} 页</small>`:''}</summary><div class="evidence-body">${articleBody(nodeId,c)}</div></details>`;}).join('')}</div>`;
 }

 const dialog=document.createElement('dialog');dialog.id='textbook-reader';dialog.setAttribute('aria-labelledby','textbook-title');
 dialog.innerHTML=`<div class="textbook-reader-shell"><header class="textbook-reader-header"><div><span class="textbook-eyebrow">同步教材</span><h2 id="textbook-title"></h2></div><div><button type="button" id="textbook-expand" aria-pressed="false">全屏阅读</button><button type="button" id="textbook-close" aria-label="关闭教材，返回知识点">✕</button></div></header><div class="textbook-reader-toolbar"><button id="textbook-prev" aria-label="上一张关联教材页">←</button><label for="textbook-page">关联页<select id="textbook-page"></select></label><button id="textbook-next" aria-label="下一张关联教材页">→</button><span class="textbook-toolbar-space"></span><button id="textbook-zoom-out" aria-label="缩小教材">−</button><output id="textbook-zoom-label" aria-live="polite">适合宽度</output><button id="textbook-zoom-in" aria-label="放大教材">＋</button><button id="textbook-fit">适合宽度</button></div><p id="textbook-version"></p><div id="textbook-viewport" tabindex="0" aria-label="教材原页，可滚动查看"><div id="textbook-image-wrap"><img id="textbook-image" alt=""></div><div id="textbook-page-state" role="status"></div></div><footer class="textbook-reader-footer"><div><strong id="textbook-position"></strong><span id="textbook-locator"></span></div><a id="textbook-pdf" target="_blank" rel="noopener">打开单页 PDF ↗</a></footer></div>`;
 document.body.append(dialog);
 const el=id=>dialog.querySelector('#'+id);
 let currentPages=[],index=0,zoom=1,caller=null;
 function setZoom(value){zoom=Math.max(1,Math.min(3,value));el('textbook-image-wrap').style.width=(zoom*100)+'%';el('textbook-zoom-label').textContent=zoom===1?'适合宽度':Math.round(zoom*100)+'%';el('textbook-zoom-out').disabled=zoom<=1;el('textbook-zoom-in').disabled=zoom>=3;}
 function drawPage(){
  const a=currentPages[index];if(!a)return;
  el('textbook-title').textContent=a.book+' · 第 '+a.printedPage+' 页';
  el('textbook-page').value=String(index);el('textbook-prev').disabled=index===0;el('textbook-next').disabled=index===currentPages.length-1;
  const v=a.textbookVersion||{};el('textbook-version').textContent=[v.edition,v.impression,v.isbn?'ISBN '+v.isbn:null].filter(Boolean).join(' · ');
  el('textbook-position').textContent=`本知识点关联页 ${index+1} / ${currentPages.length} · 印刷页 ${a.printedPage} · PDF 第 ${a.pdfPage} 页`;
  el('textbook-locator').innerHTML=text(a.locations.join('；'));
  const image=el('textbook-image'),state=el('textbook-page-state');image.hidden=true;state.hidden=false;state.textContent='正在打开教材页…';
  image.onload=()=>{const retryFocused=state.contains(document.activeElement);image.hidden=false;state.hidden=true;if(retryFocused)el('textbook-close').focus({preventScroll:true});};
  image.onerror=()=>{state.textContent='教材页未能打开。可以重试，或打开单页 PDF。';const b=document.createElement('button');b.textContent='重新加载';b.onclick=()=>{image.src=a.image+'?retry='+Date.now();};state.append(b);};
  image.alt=a.book+'，印刷第 '+a.printedPage+' 页。'+a.locations.join('；');image.src=a.image;
  el('textbook-pdf').href=a.pdf;el('textbook-viewport').scrollTo(0,0);setZoom(1);
 }
 function open(nodeId,anchorId,trigger){
  if(!available)return;
  const a=data.anchors[anchorId];if(!a)return;
  currentPages=pages([...articles(nodeId),...excerpts(nodeId)].flatMap(c=>[...(c.anchorIds||[]),...(c.contextAnchorIds||[])]).concat(anchorId).filter(id=>data.anchors[id]));
  index=Math.max(0,currentPages.findIndex(x=>x.sourceId===a.sourceId&&x.pdfPage===a.pdfPage));caller=trigger;
  el('textbook-page').innerHTML=currentPages.map((p,i)=>`<option value="${i}">${esc(p.book)} · 第 ${esc(p.printedPage)} 页</option>`).join('');
  drawPage();dialog.showModal();el('textbook-close').focus({preventScroll:true});
 }
 function close(){if(!dialog.open)return;dialog.close();dialog.classList.remove('expanded');el('textbook-expand').setAttribute('aria-pressed','false');el('textbook-expand').textContent='全屏阅读';if(caller?.isConnected)caller.focus({preventScroll:true});}
 el('textbook-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 el('textbook-prev').onclick=()=>{if(index>0){index--;drawPage();}};el('textbook-next').onclick=()=>{if(index<currentPages.length-1){index++;drawPage();}};
 el('textbook-page').onchange=e=>{index=Number(e.target.value);drawPage();};
 el('textbook-zoom-in').onclick=()=>setZoom(zoom+.25);el('textbook-zoom-out').onclick=()=>setZoom(zoom-.25);el('textbook-fit').onclick=()=>{setZoom(1);el('textbook-viewport').scrollTo(0,0);};
 el('textbook-expand').onclick=()=>{const expanded=dialog.classList.toggle('expanded');el('textbook-expand').setAttribute('aria-pressed',String(expanded));el('textbook-expand').textContent=expanded?'退出全屏':'全屏阅读';};
 dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.target.matches('select'))return;if(e.key==='ArrowRight'){e.preventDefault();el('textbook-next').click();}else if(e.key==='ArrowLeft'){e.preventDefault();el('textbook-prev').click();}});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-textbook-anchor]');if(b&&!b.disabled)open(b.dataset.textbookNode,b.dataset.textbookAnchor,b);});
 window.addEventListener('popstate',close);
 function setAvailability(config){available=config?.available===true;availabilityKnown=true;document.querySelectorAll('[data-textbook-anchor]').forEach(b=>{b.disabled=!available;b.title=available?'查看教材原页':'教材页暂时无法连接，请刷新后重试';});document.querySelectorAll('[data-textbook-availability]').forEach(el=>el.textContent=available?'':'教材页暂时无法连接，请刷新后重试');}
 fetch('textbook-availability.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(setAvailability).catch(()=>setAvailability(null));
 window.TextbookReader={articles,nodePages,render,overview,links,entry,text,math,description:id=>articles(id)[0]?.text||'',isOpen:()=>dialog.open,close};
})();
