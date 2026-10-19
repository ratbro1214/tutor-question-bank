/* Mathematical typography only. Source strings and graph records stay intact. */
(function(root){
 'use strict';
 const supers='⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿᵏˣⁱʸ',supersTo='0123456789+-nkxiy';
 const subs='₀₁₂₃₄₅₆₇₈₉₊₋ₙₖₓ',subsTo='0123456789+-nkx';
 const mapChars=(s,from,to)=>[...s].map(c=>to[from.indexOf(c)]).join('');
 function normalize(source,texMode=false){
  const literals=[];
  if(texMode)source=source.replace(/\\(?:text|mathrm|operatorname)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g,x=>{const id=literals.push(x)-1;return '\ue000'+id+'\ue001';});
  let s=source.replace(/−|–/g,'-').replace(/…/g,'\\ldots').replace(/\.\.\./g,'\\ldots');
  if(!texMode)s=s.replace(/(?<![_^])\{([^{}]*)\}/g,'\\{$1\\}');
  s=s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿᵏˣⁱʸ]+/g,x=>'^{'+mapChars(x,supers,supersTo)+'}');
  s=s.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋ₙₖₓ]+/g,x=>'_{'+mapChars(x,subs,subsTo)+'}');
  s=s.replace(/([A-Za-z])(̄+)/g,(_,c,bars)=>[...bars].reduce(v=>'\\bar{'+v+'}',c)).replace(/′/g,"^{\\prime}").replace(/([A-Za-z]+)⃗/g,(_,v)=>v.length===1?'\\vec{'+v+'}':'\\overrightarrow{'+v+'}').replace(/([A-Za-z])底/g,'$1_{\\text{底}}');
  s=s.replace(/([_^])\(([^()]*)\)/g,'$1{$2}');
  if(!texMode)s=s.replace(/([_^])(\d+|[A-Za-z])/g,'$1{$2}');
  s=s.replace(/(?<![A-Za-z])Sn(?![A-Za-z])/g,'S_{n}').replace(/qSn/g,'qS_{n}');
  const symbols={'≥':'\\ge ','≤':'\\le ','≠':'\\ne ','≈':'\\approx ','∞':'\\infty ','∈':'\\in ','∉':'\\notin ','⊆':'\\subseteq ','⊂':'\\subset ','∪':'\\cup ','∩':'\\cap ','∅':'\\varnothing ','∑':'\\sum ','∏':'\\prod ','×':'\\times ','·':'\\cdot ','±':'\\pm ','α':'\\alpha ','β':'\\beta ','γ':'\\gamma ','δ':'\\delta ','θ':'\\theta ','λ':'\\lambda ','μ':'\\mu ','π':'\\pi ','σ':'\\sigma ','φ':'\\varphi ','ω':'\\omega ','Δ':'\\Delta ','Σ':'\\Sigma ','ε':'\\varepsilon ','η':'\\eta ','τ':'\\tau ','ζ':'\\zeta ','ξ':'\\xi ','Ω':'\\Omega ','Φ':'\\Phi ','ψ':'\\psi ','⇒':'\\Rightarrow ','⇔':'\\Leftrightarrow ','→':'\\to ','⊥':'\\perp ','∥':'\\parallel ','∠':'\\angle ','∃':'\\exists ','∀':'\\forall '};
  s=s.replace(/[≥≤≠≈∞∈∉⊆⊂∪∩∅∑∏×·±αβγδθλμπσφωΔΣεητζξΩΦψ⇒⇔→⊥∥∠∃∀]/g,c=>symbols[c]);
  if(!texMode)s=s.replace(/(?<!\\)(arcsin|arccos|arctan|sin|cos|tan|cot|ln|lg|log|exp)/g,'\\$1 ');
  if(!texMode)s=s.replace(/(?<![A-Za-z\\])(cm|min|kg|mm)(?![A-Za-z])/g,'\\mathrm{$1}');
  s=s.replace(/([_^])\{([\u3400-\u9fff]+)\}/g,'$1{\\text{$2}}').replace(/_([\u3400-\u9fff])/g,'_{\\text{$1}}');
  s=s.replace(/_{2,}/g,x=>'\\underline{\\phantom{'+('0'.repeat(x.length))+'}}');
  s=s.replace(/(?<!\\)%/g,'\\%');
  return layout(s).replace(/\ue000(\d+)\ue001/g,(_,i)=>literals[Number(i)]);
 }
 function layout(s){
  s=s.replace(/\\(?:big|Big|bigg|Bigg)(?=\/)/g,'');
  s=s.replace(/\\(?:left|right)(?=[()\[\]|])/g,'');
  // Parse groups recursively: coordinates, nested ratios and fractional exponents.
  function atomAt(start){
   let i=start,atom='',functionCommand=false;
   if(s[i]==='\ue000'){const end=s.indexOf('\ue001',i+1);return end<0?null:{text:s.slice(i,end+1),end:end+1};}
   if(s[i]==='√'){
    const a=atomAt(i+1);return a?{text:'\\sqrt{'+ungroup(a.text)+'}',end:a.end}:null;
   }
   if(s[i]==='|'){
    const close=s.indexOf('|',i+1);if(close<0)return null;
    atom='|'+layout(s.slice(i+1,close))+'|';i=close+1;
   }else if(s.slice(i,i+2)==='\\{'){
    const close=s.indexOf('\\}',i+2);if(close<0)return null;
    atom='\\{'+layout(s.slice(i+2,close))+'\\}';i=close+2;
   }else if(s[i]==='('||s[i]==='{'||s[i]==='['){
    const left=s[i],right={'(':')','{':'}','[':']'}[left];let depth=1;i++;
    while(i<s.length&&depth){if(s[i]===left)depth++;if(s[i]===right)depth--;i++;}
    if(depth)return null;atom=left+layout(s.slice(start+1,i-1))+right;
   }else if(s[i]==='\\'){
    const m=s.slice(i).match(/^\\[A-Za-z]+\s*/);if(!m)return null;atom=m[0];i+=atom.length;
    const command=atom.trim();functionCommand=/^\\(?:arcsin|arccos|arctan|sin|cos|tan|cot|ln|lg|log|exp)$/.test(command);
    const arity=/^\\(?:frac|dfrac|tfrac|binom)$/.test(command)?2:/^\\(?:sqrt|mathrm|text|operatorname|vec|overrightarrow|bar|overline|hat|widehat|mathbf|mathbb|mathcal|mathsf|boldsymbol)$/.test(command)?1:0;
    if(command==='\\sqrt'&&s[i]==='['){const a=atomAt(i);if(!a)return null;atom+=a.text;i=a.end;}
    for(let n=0;n<arity;n++){
     while(s[i]===' ')i++;
     const a=s[i]==='{'?atomAt(i):s[i]==='\\'?atomAt(i):s[i]?{text:s[i],end:i+1}:null;if(!a)return null;
     atom+=a.text;i=a.end;
    }
   }else{
    const m=s.slice(i).match(/^(?:(?:\d+(?:\.\d+)?|\.\d+)|[A-Za-zΑ-Ωα-ω])/);if(!m)return null;atom=m[0];i+=atom.length;
   }
   if(/^[A-Za-z]$/.test(atom)&&s[i]==='('){const a=atomAt(i);if(a){atom+=a.text;i=a.end;}}
   while(s[i]==='_'||s[i]==='^'){
    const sign=s[i++],a=atomAt(i);if(!a)return null;atom+=sign+a.text;i=a.end;
   }
   if(s[i]==='('&&(/^[A-Za-z](?:_\{[^{}]*\})?(?:\^\{\\prime\})?$/.test(atom)||/^\\(?:bar|overline)\{[A-Za-z]\}(?:\^\{\\prime\})?$/.test(atom))){
    const a=atomAt(i);if(a){atom+=a.text;i=a.end;}
   }
   if(functionCommand){
    let next=i;while(s[next]===' ')next++;
    if(/[({[]/.test(s[next]||'')){
     const arg=atomAt(next);if(arg){atom+=s.slice(i,next)+arg.text;i=arg.end;}
    }else if(/[A-Za-z0-9Α-Ωα-ω\\]/.test(s[next]||'')&&s.slice(next,next+2)!=='\\\\'){
     const arg=atomAt(next);if(arg){
      let value=arg.text,end=arg.end;
      // A numeric coefficient followed directly by one angle/variable (sin 2α).
      if(/^\d+(?:\.\d+)?$/.test(value)&&/[A-Za-zΑ-Ωα-ω\\]/.test(s[end]||'')&&!/^\\(?:sin|cos|tan|cot|ln|lg|log|exp)\b/.test(s.slice(end))){const tail=atomAt(end);if(tail){value+=tail.text;end=tail.end;}}
      atom+=s.slice(i,next)+value;i=end;
     }
    }
   }
   while(s[i]==='!'){atom+='!';i++;}
   return {text:atom,end:i};
  }
  function ungroup(t){return t.startsWith('(')&&t.endsWith(')')||t.startsWith('[')&&t.endsWith(']')?t.slice(1,-1):t;}
  const out=[];
  for(let i=0;i<s.length;){
   if(s.slice(i,i+2)==='\\\\'){out.push({text:'\\\\',atom:false});i+=2;continue;}
   if(s[i]==='/'&&out.length){
    let right=i+1,j=out.length-1;while(s[right]===' ')right++;while(j>=0&&!out[j].atom&&/^\s*$/.test(out[j].text))j--;const a=atomAt(right),last=out[j];
    if(a&&last?.atom){out.splice(j);out.push({text:'\\frac{'+ungroup(last.text)+'}{'+ungroup(a.text)+'}',atom:true});i=a.end;continue;}
   }
   const a=atomAt(i);if(a){out.push({text:a.text,atom:true});i=a.end;}
   else{out.push({text:s[i],atom:false});i++;}
  }
  return out.map(x=>x.text).join('');
 }
 // Chinese prose separates mathematical runs; ordinary English words and units stay prose.
 const runs=/(?:[_^]\{[^{}]*\}|[A-Za-zΑ-Ωα-ω0-9₀-₉₊₋ₙₖₓ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿᵏˣⁱʸ√∞∅∑∏⃗′̄底_\^+\-−–*/=<>≥≤≠≈±×·∈∉⊆⊂∪∩⇒⇔→⊥∥∠∃∀!(){}\[\]|,.'…\s])+/g;
 function runsIn(raw){
  if(!raw.includes('\\'))return raw.matchAll(runs);
  const found=[],allowed=/[A-Za-zΑ-Ωα-ω0-9₀-₉₊₋ₙₖₓ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿᵏˣⁱʸ√∞∅∑∏⃗′̄底_\^+\-−–*/=<>≥≤≠≈±×·∈∉⊆⊂∪∩⇒⇔→⊥∥∠∃∀!(){}\[\]|,.'…%&\s\\]/;
  for(let i=0;i<raw.length;){if(!allowed.test(raw[i])){i++;continue;}const start=i;let depth=0;
   while(i<raw.length&&(allowed.test(raw[i])||depth>0)){
    if(raw[i]==='{')depth++;else if(raw[i]==='}')depth=Math.max(0,depth-1);i++;
   }
   const match=[raw.slice(start,i)];match.index=start;found.push(match);
  }
  return found;
 }
 function plainParts(raw){
  const identities=[...raw.matchAll(/\b(?:[UL]\d{2,3}|K\d{3}|S\d{4}-PDF|TB-[BS]\d)\b/g)];
  if(identities.length){const kept=[];let end=0;for(const m of identities){kept.push(...plainParts(raw.slice(end,m.index)),m[0]);end=m.index+m[0].length;}kept.push(...plainParts(raw.slice(end)));return kept;}

  const result=[];let end=0;
  for(const match of runsIn(raw)){
   const whole=match[0],lead=whole.match(/^\s*/)[0].length;
   let value=whole.trim().replace(/[,.]+$/,'');
   if(!value||!/[A-Za-zΑ-Ωα-ω∞∅√∑∏\\]/.test(value)&&!/\d[\/^]|\d.*\/.*\d|^[([][−\-\d.,+\s]+[)\]]$/.test(value)&&!/[=<>≥≤≠≈∈∉∪∩⇒⇔]/.test(value))continue;
   if(/^[A-Za-z]+$/.test(value)&&value.length>2&&!/(sin|cos|tan|cot|ln|lg|log|exp)/.test(value))continue;
   if(/^(cm|mm|kg|min|PDF|ISBN|TB|html|WPS|DOCX|SHA256|LaTeX|MathType|RELATED_TO|APPLIES_TO|COMPARES_WITH|USES_KNOWLEDGE|PREREQUISITE_OF|COMPETENCY_TAG|SOLVED_BY)$/i.test(value)||/^(?:[UL]\d{2,3}|K\d{3}|[A-Z]+_[A-Z_]+)$/.test(value))continue;
   if(!value.includes('\\')&&(value.match(/[A-Za-z]{3,}/g)||[]).some(w=>!/(?:sin|cos|tan|cot|ln|lg|log|exp|overline)/.test(w)))continue;
   if(value==='sin/cos'||value==='tan/cot')continue;
   // A slash with no left or right operand is a label/data separator, not division.
   if(value.startsWith('/')||value.endsWith('/')||/^\d+(?:\/\d+){2,}$/.test(value))continue;
   // Unbalanced punctuation belongs to the surrounding sentence, not the equation.
   while(value.startsWith('(')&&!/^\([^,]*,[^,]*\]$/.test(value)&&value.split('(').length>value.split(')').length)value=value.slice(1);
   while(value.endsWith(')')&&!/^\[[^,]*,[^,]*\)$/.test(value)&&value.split(')').length>value.split('(').length)value=value.slice(0,-1);
   const start=match.index+whole.indexOf(value,lead);
   if(start>end)result.push(raw.slice(end,start));
   result.push({source:value,tex:normalize(value,value.includes('\\'))});end=start+value.length;
  }
  if(end<raw.length)result.push(raw.slice(end));
  return result.length?result:[raw];
 }
 function parts(value){
  const raw=String(value??''),result=[];let end=0;
  const re=/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  for(const match of raw.matchAll(re)){
   result.push(...plainParts(raw.slice(end,match.index)));
   const token=match[0],two=token.startsWith('$$')||token.startsWith('\\');
   result.push({source:token,tex:token.slice(two?2:1,two?-2:-1),display:token.startsWith('$$')||token.startsWith('\\[')});end=match.index+token.length;
  }
  if(!end&&/\\[A-Za-z]+/.test(raw)&&!/[\u3400-\u9fff]/.test(raw))return [{source:raw,tex:normalize(raw,true)}];
  result.push(...plainParts(raw.slice(end)));return result;
 }
 const api={parts,normalize,formatTex:source=>{const raw=String(source);return /\\[A-Za-z]+/.test(raw)&&!raw.includes('/')?raw:normalize(raw,true);}};if(typeof module==='object'&&module.exports)module.exports=api;else root.MathText=api;
})(typeof window==='object'?window:globalThis);
