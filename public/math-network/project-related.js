/* Project-owned adapter; source graph IDs stay separate from project question identities. */
(() => {
 'use strict';
 let controller = null, current = '', pending = false;
 const container = document.getElementById('reader-body');
 if (!container) return;
 const el = (tag, text, parent) => {const n=document.createElement(tag);if(text)n.textContent=text;if(parent)parent.append(n);return n;};
 const link = (parent, text, url) => {const n=el('a',text,parent);n.href=url;n.target='_top';return n;};
 function questionList(parent, group, chapter=false) {
  const section=el('section',null,parent);
  el('h4',`${group.name} · ${group.total} 题`,section);
  if(group.basis==='curated_component')el('p','按较宽的分类关联，需逐题确认是否适合当前知识点。',section);
  if(chapter)el('p','同章节拓展，不表示与当前知识点直接匹配。',section);
  for(const q of group.items || []) {
   const a=link(section,'','/math-library/'+encodeURIComponent(q.id));
   a.className='project-related-question';
   const text=String(q.text || q.original_text || '打开题库题目').replace(/\s+/g,' ').trim();
   a.textContent=text.length>150 ? text.slice(0,150)+'…' : text;
  }
  if(group.code)link(section,'查看全部 →','/math-library?'+new URLSearchParams({stage:'高中',[chapter?'chapter':'knowledge']:group.code}));
 }
 async function update() {
  pending=false;
  const id=new URLSearchParams(location.hash.slice(1)).get('read');
  const existing=document.getElementById('project-related-panel');
  if(!id){controller?.abort();existing?.remove();current='';return;}
  if(id===current&&existing)return;
  current=id;controller?.abort();controller=new AbortController();existing?.remove();
  const panel=el('details');panel.id='project-related-panel';panel.className='project-related-panel';
  const summary=el('summary','本项目知识点与题目',panel);
  const body=el('div',null,panel);body.className='project-related-body';el('p','正在查询你的题库…',body);
  container.prepend(panel);
  try {
   const response=await fetch('/api/math-network/related?node='+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'题库暂不可用');
   if(current!==id||!panel.isConnected)return;
   body.replaceChildren();
   if(!data.mapping){el('p',data.notice,body);summary.textContent='本项目关联 · 暂无明确知识点映射';return;}
   const count=data.groups.reduce((sum,g)=>sum+g.total,0);
   summary.textContent='本项目知识点与题目'+(count?' · 分类匹配 '+count+' 题':'');
   for(const kp of data.mapping.knowledgeCodes) {
    const row=el('p',null,body);link(row,kp.name,'/math-library?'+new URLSearchParams({knowledge:kp.code,stage:'高中'}));
    el('span',kp.basis==='exact_name'?' · 同名对应':' · 分类包含关系',row);
   }
   for(const n of data.catalogNodes){const row=el('p',null,body);link(row,'现有知识目录：'+n.name,'/knowledge-graph/star-map');el('span',n.knowledge_review_status==='approved'?' · 已审核':' · 待审核',row);}
   if(data.catalogUnavailable)el('p','知识目录暂不可用，题目分类查询独立展示。',body);
   const matched=data.groups.filter(g=>g.total>0);
   for(const g of matched)questionList(body,g);
   if(!matched.length)el('p',data.mapping.knowledgeCodes.length?'当前分类下暂无题目。':'暂无明确的题目知识点对应，以下仅按章节拓展。',body);
   for(const g of data.chapterGroups.filter(g=>g.total>0))questionList(body,g,true);
   if(!matched.length&&!(data.chapterGroups||[]).some(g=>g.total>0))el('p','已查询当前可访问题库；该范围暂未收录题目。',body);
   el('p',data.notice,body);
  } catch(error) {
   if(error.name==='AbortError'||current!==id)return;
   body.replaceChildren();el('p','关联查询失败：'+error.message,body);
   const retry=el('button','重试',body);retry.type='button';retry.onclick=()=>{current='';schedule();};
  }
 }
 function schedule(){if(pending)return;pending=true;requestAnimationFrame(update);}
 new MutationObserver(schedule).observe(container,{childList:true,subtree:true});
 window.addEventListener('hashchange',schedule);
 schedule();
})();
