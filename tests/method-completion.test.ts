import test from 'node:test';
import assert from 'node:assert/strict';
import { openMathCatalog } from '../lib/open-math';
import { fillMissingThinking, methodCompletionSchema, missingThinking } from '../lib/method-completion';
import { completeMethodThinking } from '../lib/method-completion-ai';
import type { ExplanationProvider } from '../lib/explanation-generation';

const method = openMathCatalog.methods.find(m => m.content.name === '基本不等式求最值')!.content;
const suggestion = { signals: ['正数的和或积具有约束，题目要求最值。'], motivation: '观察能否构造定和或定积结构，应用基本不等式前检查正性，并核对等号能否在约束下取得。' };
const config: ExplanationProvider = { apiKey:'test-key',baseUrl:'https://example.invalid/v1',apiStyle:'chat_completions',model:'test-model',strictJsonSchema:false };
const reply = (content: unknown, finish_reason='stop') => new Response(JSON.stringify({ choices:[{finish_reason,message:{content:JSON.stringify(content)}}] }), {headers:{'Content-Type':'application/json'}});
test('补全只填空缺，保留原文和已有字段，不修改输入对象', () => {
  const before=JSON.stringify(method), filled=fillMissingThinking(method,suggestion);
  assert.equal(JSON.stringify(method),before);assert.deepEqual(filled.signals,suggestion.signals);assert.equal(filled.motivation,suggestion.motivation);assert.deepEqual(filled.conditions,method.conditions);
  const edited={...method,signals:['教师识别信号'],motivation:'教师思路'};
  assert.deepEqual(fillMissingThinking(edited,suggestion),edited);
  assert.deepEqual(missingThinking({...method,signals:[' '],motivation:' '}),{signals:true,motivation:true});
  assert.throws(()=>methodCompletionSchema.parse({...suggestion,signals:[]}));
});
test('复用 Chat Completions 配置、校验结构，并返回生成模型和提示词版本', async () => {
  const result=await completeMethodThinking(method,config,undefined,async (url,init) => {
    assert.equal(url,'https://example.invalid/v1/chat/completions');
    const body=JSON.parse(String(init?.body));assert.equal(body.model,'test-model');assert.match(body.messages[0].content,/等号是否可达/);
    assert.equal(JSON.parse(body.messages[1].content).method.name,method.name);return reply(suggestion);
  });
  assert.deepEqual(result.suggestion,suggestion);assert.equal(result.model,'test-model');assert.equal(result.promptVersion,'method-thinking-v1');
});
test('支持 Responses 接口，拒绝截断、错误结构及未配置模型', async () => {
  await completeMethodThinking(method,{...config,apiStyle:'responses'},undefined,async (url) => {
    assert.equal(url,'https://example.invalid/v1/responses');return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(suggestion)}]}]}),{headers:{'Content-Type':'application/json'}});
  });
  await assert.rejects(completeMethodThinking(method,config,undefined,async()=>reply(suggestion,'length')),/无效/);
  await assert.rejects(completeMethodThinking(method,config,undefined,async()=>reply({signals:[]})),/无效/);
  await assert.rejects(completeMethodThinking(method,{...config,apiKey:''}),/尚未配置/);
  await assert.rejects(completeMethodThinking(method,config,undefined,async()=>new Response('',{status:503})),/HTTP 503/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(completeMethodThinking(method,config,controller.signal,async()=>{throw Error('不应调用');}),/取消/);
});
