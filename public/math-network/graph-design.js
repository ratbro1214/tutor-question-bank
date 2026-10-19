/* Graph presentation only: no inferred edges or changes to curriculum data. */
(function(root){
  'use strict';
  const GROUPS={
    algebra:{label:'集合与代数',color:'#A56721'},
    functions:{label:'函数与分析',color:'#3868B8'},
    geometry:{label:'几何与向量',color:'#8254AA'},
    sequence:{label:'数列与计数',color:'#B34F66'},
    statistics:{label:'概率与统计',color:'#25806B'},
    cross:{label:'跨章知识与方法',color:'#477E91'},
    competency:{label:'核心素养',color:'#B54F87'},
    curriculum:{label:'教材目录',color:'#68768C'}
  };
  const TYPES={
    THOUGHT:{label:'数学思想',color:'#A86B30',shape:'triangle'},
    THINKING_PROCESS:{label:'思维过程',color:'#71824B',shape:'diamond'},
    COMPETENCY:{label:'核心素养',color:'#B54F87',shape:'hex'},
    TEXTBOOK:{label:'教材 / 章节',color:'#64748B',shape:'square'},
    KNOWLEDGE:{label:'知识 / 主题',color:'#2E73B7',shape:'circle'},
    METHOD:{label:'解题方法',color:'#8055AE',shape:'diamond'},
    SKILL:{label:'应用能力',color:'#21816B',shape:'square'}
  };
  function type(n){return ['THOUGHT','THINKING_PROCESS'].includes(n.type)?n.type:n.type==='COMPETENCY'?'COMPETENCY':['METHOD','METHOD_FAMILY'].includes(n.type)?'METHOD':n.type==='SKILL'?'SKILL':['KNOWLEDGE','TOPIC'].includes(n.type)?'KNOWLEDGE':'TEXTBOOK';}
  function chapterGroup(name){return /概率|统计/.test(name)?'statistics':/数列|计数/.test(name)?'sequence':/向量|空间|几何|直线|圆锥/.test(name)?'geometry':/函数|导数|三角/.test(name)?'functions':'algebra';}
  function group(n,byId){
    if(n.type==='THOUGHT')return 'cross';
    if(n.type==='COMPETENCY')return 'competency';
    if(n.type==='TEXTBOOK')return 'curriculum';
    const names=n.type==='CHAPTER'?[n.name]:(n.chapterIds||[]).map(id=>byId(id)?.name).filter(Boolean);
    const keys=[...new Set(names.map(chapterGroup))];
    return keys.length>1&&['METHOD','METHOD_FAMILY'].includes(n.type)?'cross':keys[0]||'cross';
  }
  function focus(nodes,edges,id){
    const ids=new Set(nodes.map(n=>n.id)), roles=new Map(), links=new Set();
    if(!ids.has(id))return {id:null,roles,links};
    roles.set(id,'current');
    for(const e of edges){
      if(e.source!==id&&e.target!==id)continue;
      const other=e.source===id?e.target:e.source;if(!ids.has(other))continue;
      links.add(e.id);
      const role=e.type==='PREREQUISITE_OF'?(e.target===id?'before':'after'):['ILLUSTRATES_THOUGHT','GUIDES_METHOD','USES_PROCESS','EXPLORES_KNOWLEDGE'].includes(e.type)?'thought':['SOLVED_BY','USES_KNOWLEDGE'].includes(e.type)?'method':'context';
      const old=roles.get(other);if(!old||old==='context'||old==='method'&&role!=='context')roles.set(other,role);
    }
    return {id,roles,links};
  }
  function layout(nodes,edges,{byId,mode,scope,aspect=1.6}){
    const positions=new Map(),groups=[],bands=[];
    const put=(n,x,y)=>positions.set(n.id,{n,x,y});
    // Local graph gives the existing prerequisites an explicit, readable direction.
    if(['neighbors','before','after'].includes(mode)&&nodes.some(n=>n.id===scope)&&nodes.length<100){
      const f=focus(nodes,edges,scope),bins={before:[],after:[],method:[],thought:[],competency:[],parent:[],context:[]};
      if(mode==='before'||mode==='after'){
        const levels=new Map([[scope,0]]),queue=[scope],ids=new Set(nodes.map(n=>n.id));
        while(queue.length){const current=queue.shift();for(const e of edges){
          if(e.type!=='PREREQUISITE_OF')continue;
          const next=mode==='before'&&e.target===current?e.source:mode==='after'&&e.source===current?e.target:null;
          if(next&&ids.has(next)&&!levels.has(next)){levels.set(next,levels.get(current)+1);queue.push(next);}
        }}
        const columns=new Map();for(const n of nodes){const level=levels.get(n.id)??0;if(!columns.has(level))columns.set(level,[]);columns.get(level).push(n);}
        for(const [level,ns]of columns)ns.forEach((n,i)=>put(n,(mode==='before'?-1:1)*level*300,(i-(ns.length-1)/2)*100));
        return {positions,groups,local:true};
      }
      const parentIds=new Set(byId(scope)?.topicIds||[]);
      for(const e of edges)if(e.target===scope&&['CONTAINS','SPECIALIZES_TO'].includes(e.type))parentIds.add(e.source);
      for(const n of nodes)if(n.id!==scope){
        const role=f.roles.get(n.id)||'context';
        const bin=n.type==='COMPETENCY'?'competency':['TEXTBOOK','CHAPTER','SECTION','LESSON'].includes(n.type)?'parent':role==='context'&&parentIds.has(n.id)?'parent':role;
        bins[bin].push(n);
      }
      put(byId(scope),0,0);
      const narrow=aspect<1.1,across=narrow?3:6,sideX=narrow?190:300,rowGap=86;
      for(const side of ['before','after'])bins[side].forEach((n,i)=>put(n,(side==='before'?-1:1)*(sideX+Math.floor(i/7)*235),(i%7-(Math.min(7,bins[side].length)-1)/2)*rowGap));
      const sideExtent=Math.max(0,(Math.min(7,Math.max(bins.before.length,bins.after.length))-1)*rowGap/2);
      const row=(ns,y,{columns=across,gap=155,direction=1}={})=>ns.forEach((n,i)=>put(n,(i%columns-(Math.min(columns,ns.length-Math.floor(i/columns)*columns)-1)/2)*gap,y+direction*Math.floor(i/columns)*92));
      // Curriculum membership is a separate layer, never a prerequisite.
      let top=-sideExtent-150;
      if(bins.parent.length){
        const hasCurriculum=bins.parent.some(n=>n.type==='TEXTBOOK'),columns=narrow||hasCurriculum?1:2;
        if(hasCurriculum){const depth={TEXTBOOK:0,CHAPTER:1,SECTION:2,TOPIC:2,LESSON:3,KNOWLEDGE:4};bins.parent.sort((a,b)=>(depth[b.type]??4)-(depth[a.type]??4));}
        row(bins.parent,top,{columns,gap:360,direction:-1});bands.push({label:bins.parent.every(n=>n.type==='TOPIC')?'所属主题':'教材与所属单元',y:top-(Math.ceil(bins.parent.length/columns)-1)*92-42});top-=Math.ceil(bins.parent.length/columns)*92+60;
      }
      if(bins.competency.length){const startY=top-(Math.ceil(bins.competency.length/across)-1)*92;row(bins.competency,startY);bands.push({label:'关联素养',y:startY-42});}
      bands.push({label:byId(scope)?.type==='THOUGHT'?'数学思想 · 跨内容联系':'前置准备 → 当前知识 → 后续知识',y:-sideExtent-48});
      let bottom=sideExtent+150;
      if(bins.method.length){row(bins.method,bottom);bands.push({label:['METHOD','METHOD_FAMILY'].includes(byId(scope)?.type)?'使用的知识与方法':'方法与应用',y:bottom-42});bottom+=Math.ceil(bins.method.length/across)*92+55;}
      if(bins.thought.length){row(bins.thought,bottom);bands.push({label:'思想联系 · 知识与方法',y:bottom-42});bottom+=Math.ceil(bins.thought.length/across)*92+55;}
      if(bins.context.length){row(bins.context,bottom);bands.push({label:'其他关联',y:bottom-42});}
      return {positions,groups,bands,local:true};
    }
    // A finite force layout follows real links; colors no longer define separate circular islands.
    // High-degree classification hubs do not pull the entire course into a single star.
    const ordered=nodes.slice().sort((a,b)=>a.id.localeCompare(b.id)),area=Math.max(90000,nodes.length*4200);
    const ratio=Math.max(.65,Math.min(2.8,aspect)),w=Math.sqrt(area*ratio),h=w/ratio;
    const halton=(i,base)=>{let value=0,f=1;while(i>0){f/=base;value+=f*(i%base);i=Math.floor(i/base);}return value;};
    const ps=ordered.map((n,i)=>{const x=(halton(i+1,2)-.5)*w,y=(halton(i+1,3)-.5)*h;return {n,x,y,ax:x,ay:y,vx:0,vy:0,fx:0,fy:0};});
    const index=new Map(ps.map(p=>[p.n.id,p])),degree=new Map();
    const links=edges.filter(e=>['PREREQUISITE_OF','SOLVED_BY','USES_KNOWLEDGE','RELATED_TO','CONTAINS','TEACHES','SPECIALIZES_TO','ILLUSTRATES_THOUGHT','GUIDES_METHOD','USES_PROCESS','EXPLORES_KNOWLEDGE'].includes(e.type)&&index.has(e.source)&&index.has(e.target)&&!['COMPETENCY','TEXTBOOK'].includes(index.get(e.source).n.type));
    for(const e of links){degree.set(e.source,(degree.get(e.source)||0)+1);degree.set(e.target,(degree.get(e.target)||0)+1);}
    const springs=links.filter(e=>(degree.get(e.source)||0)<26&&(degree.get(e.target)||0)<26);
    const cell=170;
    for(let step=0;step<110;step++){
      const buckets=new Map();
      for(const p of ps){p.fx=(p.ax-p.x)*.009;p.fy=(p.ay-p.y)*.009;const key=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
      for(const p of ps){const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);for(let xx=-1;xx<=1;xx++)for(let yy=-1;yy<=1;yy++)for(const q of buckets.get((gx+xx)+','+(gy+yy))||[]){if(p===q)continue;const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy)||.01;if(d>170)continue;const force=Math.min(9,2800/(d*d+30))+(d<58?(58-d)*.32:0);p.fx+=dx/d*force;p.fy+=dy/d*force;}}
      for(const e of springs){const a=index.get(e.source),b=index.get(e.target),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,strength=(e.type==='PREREQUISITE_OF'?.016:.01)/Math.sqrt(Math.max(degree.get(e.source)||1,degree.get(e.target)||1)),force=Math.max(-2,Math.min(3,(d-135)*strength));a.fx+=dx/d*force;a.fy+=dy/d*force;b.fx-=dx/d*force;b.fy-=dy/d*force;}
      for(const p of ps){p.vx=(p.vx+p.fx)*.65;p.vy=(p.vy+p.fy)*.65;const speed=Math.hypot(p.vx,p.vy),cap=speed>7?7/speed:1;p.x+=p.vx*cap;p.y+=p.vy*cap;}
    }
    for(const p of ps)put(p.n,p.x,p.y);
    return {positions,groups,local:false};
  }
  function placeLabels(candidates,{width,height,limit=30,reserved=[]}){
    const occupied=reserved.slice(),out=[];
    const overlaps=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
    for(const c of candidates){
      if(out.length>=limit)break;
      for(const offset of c.offsets||[0]){
        const box={x:Math.max(8,Math.min(width-c.w-8,c.x-c.w/2)),y:c.y+offset,w:c.w,h:c.h||20};
        if(box.x<8||box.x+box.w>width-8||box.y<8||box.y+box.h>height-8||occupied.some(b=>overlaps(box,b)))continue;
        occupied.push(box);out.push({...c,...box});break;
      }
    }
    return out;
  }
  function edgeLanes(edges){
    const pairs=new Map(),out=new Map();
    for(const e of edges){const key=[e.source,e.target].sort().join('|');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(e);}
    for(const es of pairs.values())es.slice().sort((a,b)=>a.id.localeCompare(b.id)).forEach((e,i)=>out.set(e.id,(i-(es.length-1)/2)*6*(e.source<e.target?1:-1)));
    return out;
  }
  const api={GROUPS,TYPES,type,group,focus,layout,placeLabels,edgeLanes};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GraphDesign=api;
})(typeof window==='undefined'?{}:window);
