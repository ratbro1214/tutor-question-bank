import test from 'node:test';
import assert from 'node:assert/strict';
import { detectionTiles,detectionRows,mergeDetectedAnchors } from '../lib/paper-detection';
import { buildQuestionCrops, locateQuestionAnchors, type PaperPage } from '../lib/paper';

test('overlapping tiles cover the whole page and merge matching digits',()=>{
 const tiles=detectionTiles(1800,2500);assert.equal(tiles[0].top,0);assert.equal(tiles[3].top+tiles[3].height,2500);
 assert.ok(tiles.slice(1).every((t,i)=>t.top<tiles[i].top+tiles[i].height));
 const a={page:1,number:1,x:.08,y:.12};assert.equal(mergeDetectedAnchors([a,{...a,y:.125}]).length,1);
 assert.throws(()=>mergeDetectedAnchors([a,{...a,y:.35}]),/不同位置/);
});
test('row IDs come from actual ink, blank margins and grey watermarks are excluded',()=>{
 const pixels=new Uint8ClampedArray(200*1000*4).fill(255);
 for(let y=120;y<=130;y++)for(let x=16;x<=30;x++){const i=(y*200+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}
 for(let y=150;y<=160;y++)for(let x=16;x<=30;x++){const i=(y*200+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=220;}
 assert.deepEqual(detectionRows(pixels,200,1000),[{id:0,x:16,top:120,bottom:130}]);
});
test('numeric boundaries keep choices and diagrams, exclude section instructions and footer',()=>{
 const page:PaperPage={page:1,width:1000,height:1000,items:[
  {text:'一、单项选择题',x:80,y:50,width:500,height:12},
  {text:'1. Question',x:80,y:120,width:500,height:12},
  {text:'A. option B. option',x:80,y:190,width:500,height:12},
  {text:'2. Question',x:80,y:280,width:500,height:12},
  {text:'二、多项选择题',x:80,y:500,width:500,height:12},
  {text:'3. Question',x:80,y:560,width:500,height:12},
  {text:'数学 第1页',x:400,y:900,width:200,height:12},
 ]};
 const crops=buildQuestionCrops([page],[{page:1,number:1,x:.08,y:.12},{page:1,number:2,x:.08,y:.28},{page:1,number:3,x:.08,y:.56}],[{page:1,x:.08,y:.05,bottom:.10,kind:'section'},{page:1,x:.08,y:.50,bottom:.54,kind:'section'},{page:1,x:.4,y:.90,bottom:.93,kind:'footer'}]);
 assert.equal(crops.length,3);assert.match(crops[0].text,/option/);assert.doesNotMatch(crops[0].text,/单项|2\. /);
 assert.doesNotMatch(crops[1].text,/多项|3\. /);assert.doesNotMatch(crops[2].text,/第1页/);
 assert.ok(crops[1].regions[0].y+crops[1].regions[0].height<.5);
});
test('text-layer and batch crops stop before split section headings without AI exclusions',()=>{
 const item=(text:string,x:number,y:number)=>({text,x,y,width:50,height:12});
 const pages:PaperPage[]=[{page:1,width:1000,height:1000,items:[
  item('8. Question',80,100),item('A. option',80,180),item('二、',80,250),item('多选题：',135,250),item('每小题6分',195,250),item('部分选对得部分分',80,280),item('9. Question',80,330),
  item('14. Question',80,500),item('四、请完成以下任务',80,650),item('解答应写出文字说明',80,680),item('15. Question',80,740),
 ]}];
 const crops=buildQuestionCrops(pages,locateQuestionAnchors(pages));
 assert.doesNotMatch(crops.find(c=>c.number===8)!.text,/多选|6分|部分选对|9\./);
 assert.doesNotMatch(crops.find(c=>c.number===14)!.text,/四、|任务|解答|说明|15\./);
 assert.match(crops.find(c=>c.number===8)!.text,/option/);
 assert.equal(crops.length,4);
});
test('different math font heights do not split question 19 from its punctuation',()=>{
 const page:PaperPage={page:4,width:600,height:840,items:[
  {text:'18. Question',x:56,y:160,width:100,height:10.56},
  {text:'19',x:56.64192,y:476.77632,width:10.56,height:10.56},
  {text:'．已知函数',x:67.20192,y:477.13536,width:52.56768,height:10.56},
  {text:'(',x:129.7215,y:473.2628,width:3.475,height:14.0613},
  {text:'f',x:123.286,y:475.8975,width:2.936,height:10.65},
  {text:'试卷第4页（共4页）',x:250,y:800,width:100,height:10.56},
 ]};
 const anchors=locateQuestionAnchors([page]);assert.deepEqual(anchors.map(a=>a.number),[18,19]);
 const crops=buildQuestionCrops([page],anchors);assert.equal(crops.length,2);
 assert.doesNotMatch(crops[0].text,/19|已知函数/);assert.match(crops[1].text,/19/);
  assert.doesNotMatch(crops[1].text,/第4页/);
});
