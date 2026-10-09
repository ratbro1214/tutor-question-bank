import test from 'node:test';
import assert from 'node:assert/strict';
import { readPaperDetection } from '../lib/paper-detection-response';
const rows=[{id:0,x:80,top:100,bottom:120},{id:1,x:80,top:200,bottom:220},{id:2,x:80,top:230,bottom:250}];
test('missing lastRow does not discard question anchors; heading starts at the known row',()=>{
 const result=readPaperDetection(JSON.stringify({anchors:[{number:17,row:0}],excluded:[{kind:'section',row:1}]}),rows,1000,1000);
 assert.deepEqual(result.anchors,[{number:17,x:.08,y:.1}]);
 assert.deepEqual(result.excluded,[{kind:'section',x:.08,y:.2,bottom:.22}]);
});
test('multi-line exclusions keep their full range',()=>{
 const result=readPaperDetection(JSON.stringify({anchors:[],excluded:[{kind:'section',row:1,lastRow:2}]}),rows,1000,1000);
 assert.equal(result.excluded[0].bottom,.25);
});
test('unknown rows and inverted exclusions are rejected rather than inventing coordinates',()=>{
 assert.throws(()=>readPaperDetection(JSON.stringify({anchors:[{number:18,row:99}]}),rows,1000,1000),/不存在/);
 assert.throws(()=>readPaperDetection(JSON.stringify({anchors:[],excluded:[{kind:'section',row:2,lastRow:1}]}),rows,1000,1000),/倒置/);
});
