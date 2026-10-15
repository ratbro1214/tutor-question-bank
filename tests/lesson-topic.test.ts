import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonTopicFilters } from '../lib/lesson-topic';
test('topic suggestions respect stage taxonomy and never turn a whole description into an AND query',()=>{
  assert.equal(lessonTopicFilters({stage:'高中',topic:'导数与函数单调性专题'}).chapter,'HS-DERIVATIVE');
  assert.equal(lessonTopicFilters({stage:'初中',topic:'二次函数与几何综合'}).chapter,'FUNC-QUADRATIC');
  assert.deepEqual(lessonTopicFilters({stage:'初中',topic:'未识别专题'}),{stage:'初中',chapter:'',knowledge:''});
  assert.equal(lessonTopicFilters({stage:'初中',topic:'导数'}).chapter,'');
});
