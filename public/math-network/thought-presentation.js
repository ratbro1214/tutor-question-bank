(function(root){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=s=>root.TextbookReader.text(s),node=id=>root.ThoughtTaxonomy.node(id);
 function button(n,detail=''){return '<button type="button" data-method-node="'+esc(n.id)+'" data-ui-key="thought-read:'+esc(n.id)+'"><b>'+text(n.name)+'</b><small>'+esc(detail||root.MethodNavigation.role(n))+'</small></button>';}
 function reader(n){
  const api=root.ThoughtTaxonomy,d=n.thoughtDefinition,m=api.members(n.id);
  const reason=id=>m.edges.find(e=>e.source===id||e.target===id)?.thoughtMapping?.reason||m.edges.find(e=>e.source===id||e.target===id)?.reason||'';
  const group=(title,rows,note)=>'<section class="thought-reader-section"><h2>'+title+' <small>'+rows.length+'</small></h2><p>'+note+'</p><div class="thought-link-grid">'+(rows.length?rows.map(k=>button(k,reason(k.id))).join(''):'<p>当前尚未记录这一类联系。</p>')+'</div></section>';
  const sources=api.data.evidence.filter(e=>d.evidenceIds.includes(e.id));
  const processLabels=root.MethodNavigation.labels().filter(l=>l.nodeIds.some(id=>[...m.knowledge,...m.methods,...m.viaMethods.map(r=>r.node)].some(k=>k.id===id)));
  return '<article class="thought-reader" data-node-type="THOUGHT"><div class="reader-meta"><span class="type-badge" data-node-type="THOUGHT">数学思想</span><span>跨知识点 · 跨方法</span></div><h1 id="reader-title" tabindex="-1">'+esc(n.name)+'思想</h1><p class="thought-lead">'+esc(d.description)+'</p>'+(root.MethodDecisionUI?.summary(n.id)||'')+
   '<div class="thought-usage-grid"><section><h2>学习知识时</h2><p>'+esc(d.learning)+'</p></section><section><h2>解决问题时</h2><p>'+esc(d.solving)+'</p></section></div><p class="thought-boundary">'+esc(d.boundary)+'</p>'+
   '<div class="reader-actions"><button id="path-network">查看思想关系图</button><button type="button" data-method-navigation-index>全部思想与方法</button></div>'+
   group('直接体现这一思想的知识',m.knowledge,'从知识内容的学习或应用中理解这一思想。')+
   group('体现这一思想的具体方法',m.methods,'一个方法可以体现多种思想；使用时仍需检查方法的条件。')+
   (m.processes.length?group('相关思维过程',m.processes,'从探索、形成猜想到论证，呈现学习和研究的过程。'):'')+
   '<details class="thought-reader-section thought-indirect"><summary>通过方法联系的知识 <span>'+m.viaMethods.length+'</span></summary><p>每条联系都列出中间方法，可沿方法继续查看。</p><div class="thought-link-grid">'+m.viaMethods.map(r=>button(r.node,'通过：'+r.methodIds.map(id=>node(id).name).join('、'))).join('')+'</div></details>'+
   (processLabels.length?'<details class="thought-reader-section"><summary>学习时可结合的思维过程与策略</summary><div class="method-nav-links">'+processLabels.map(l=>'<button type="button" data-method-label="'+esc(l.id)+'">'+esc(l.name)+'<small>'+esc(l.role||root.MethodNavigation.roles[l.id])+'</small></button>').join('')+'</div></details>':'')+
   '<details class="thought-reader-section"><summary>术语与来源说明</summary><p>本平台按六大思想组织入口。教材、教案和考试评析为名称与应用提供依据；“六大”是平台的组织口径。</p><ul>'+sources.map(e=>{const url=e.url||e.sourceUrl,title=esc(e.title),loc=e.locator;return '<li>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+title+'</a>':title)+(loc?.printedPage?' · 书页 '+loc.printedPage:loc?.xmlParagraphs?' · 教案段落 '+loc.xmlParagraphs.join('、'):'')+'</li>';}).join('')+'</ul><p>原有说法：'+d.aliases.map(esc).join('、')+'。</p></details></article>';
 }
 root.ThoughtPresentation={reader};
})(window);
