import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { explanationContentSchema, explanationSaveSchema, saveExplanationSql, type ExplanationContent } from "../lib/question-explanation";
import { generateExplanation, explanationInstructions, type ExplanationProvider } from "../lib/explanation-generation";

const content: ExplanationContent = {
  status: "ready", answer: "x²+6x+9", approach: "运用完全平方公式。",
  steps: [{ title: "展开", content: "(x+3)²=x²+2×x×3+3²=x²+6x+9。" }],
  teachingNotes: "让学生解释两个交叉乘积的来源。", commonMistakes: "遗漏中间项 6x。",
  verification: "令 x=1，两边均为 16；这只是一个数值检查。", alternativeMethod: "用分配律逐项相乘。", missingInformation: "",
};
const config: ExplanationProvider = { apiKey: "test-secret", baseUrl: "https://fixture.invalid/v1/", apiStyle: "responses", model: "test-model", strictJsonSchema: true };

test("完整解析必须有答案、思路和具体步骤；信息不足不能标为已核对", () => {
  assert.ok(explanationContentSchema.safeParse(content).success);
  assert.equal(explanationContentSchema.safeParse({ ...content, steps: [] }).success, false);
  assert.equal(explanationContentSchema.safeParse({ ...content, answer: "" }).success, false);
  assert.equal(explanationContentSchema.safeParse({ ...content, unsolicited: "extra" }).success, false);
  const incomplete = { ...content, status: "needs_context", answer: "", steps: [], missingInformation: "请补充图中的角度。" };
  assert.ok(explanationContentSchema.safeParse(incomplete).success);
  assert.equal(explanationSaveSchema.safeParse({ studentId: 1, expectedRevision: 0, sourceText: "原题", content: incomplete, reviewed: true, origin: "ai", model: "fixture" }).success, false);
  assert.match(explanationInstructions("高中"), /不得自行补条件或猜答案/);
  assert.match(explanationInstructions("高中"), /未完成独立核验时如实说明/);
});

test("Responses 解题同时发送原图与题干，正确解析结构化结果", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(input, "https://fixture.invalid/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, config.model);
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.input[0].content[1].type, "input_image");
    assert.equal(body.input[0].content[1].image_url, "data:image/png;base64,fixture");
    assert.match(body.input[0].content[0].text, /展开/);
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(content) }] }] });
  };
  assert.deepEqual(await generateExplanation({ questionText: "展开 (x+3)²", educationStage: "初中", imageDataUrl: "data:image/png;base64,fixture" }, config, undefined, fetcher), content);
});

test("流式响应支持跨字节分片，必须完成后才接受解析", async () => {
  const bytes = new TextEncoder().encode('event: response.output_text.delta\r\ndata: '+JSON.stringify({type:'response.output_text.delta',delta:'未完成'})+'\r\n\r\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed',output_text:JSON.stringify(content)}})+'\n\n');
  const streamed = () => new Response(new ReadableStream({start(controller) { for (let i=0;i<bytes.length;i+=7) controller.enqueue(bytes.slice(i,i+7)); controller.close(); }}), {headers:{'Content-Type':'text/event-stream'}});
  assert.deepEqual(await generateExplanation({questionText:'x',educationStage:'初中'},config,undefined,async()=>streamed()),content);
  for (const event of [{type:'response.output_text.delta',delta:JSON.stringify(content)},{type:'response.incomplete',response:{status:'incomplete'}}]) {
    await assert.rejects(generateExplanation({questionText:'x',educationStage:'初中'},config,undefined,async()=>new Response('data: '+JSON.stringify(event)+'\n\n',{headers:{'Content-Type':'text/event-stream'}})), /未完成|格式不完整/);
  }
});

test("读取模型响应期间超时或取消仍显示准确原因，不当作格式错误", async () => {
  const context={questionText:'x',educationStage:'初中'};
  const waiting: typeof fetch = async (_input,init) => new Response(new ReadableStream({start(controller){ init!.signal!.addEventListener('abort',()=>controller.error(init!.signal!.reason),{once:true}); }}),{headers:{'Content-Type':'text/event-stream'}});
  // Keep Node alive while AbortSignal.timeout's unref'ed timer runs.
  const keepAlive=setInterval(()=>{},1000);
  try {
    await assert.rejects(generateExplanation(context,{...config,timeoutMs:20},undefined,waiting), /未及时完成/);
    const abort=new AbortController(); const pending=generateExplanation(context,config,abort.signal,waiting);
    abort.abort(); await assert.rejects(pending,/取消/);
  } finally {clearInterval(keepAlive);}
});

test("兼容 Chat Completions 并在非严格模式传递 JSON 结构要求", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(input, "https://fixture.invalid/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_object");
    assert.match(body.messages[0].content, /JSON Schema/);
    assert.equal(body.messages[1].content[1].type, "image_url");
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  };
  assert.deepEqual(await generateExplanation({ questionText: "展开 (x+3)²", educationStage: "初中", imageDataUrl: "data:image/png;base64,fixture" }, { ...config, apiStyle: "chat_completions", strictJsonSchema: false }, undefined, fetcher), content);
});

test("无密钥不伪造解析，上游错误不暴露响应内容或凭据", async () => {
  const context = { questionText: "展开 (x+3)²", educationStage: "初中" };
  await assert.rejects(generateExplanation(context, { ...config, apiKey: undefined }), /尚未配置/);
  await assert.rejects(generateExplanation(context, config, undefined, async () => new Response("test-secret", { status: 401 })), (error: Error) => /401/.test(error.message) && !error.message.includes("test-secret"));
  await assert.rejects(generateExplanation(context, config, undefined, async () => Response.json({ output_text: "不是JSON" })), /格式不完整/);
  await assert.rejects(generateExplanation(context, config, undefined, async () => { throw new Error("test-secret"); }), (error: Error) => /连接失败/.test(error.message) && !error.message.includes("test-secret"));
});

test("兼容模型混用已转义与未转义的 LaTeX，保留换行与 JSON 转义", async () => {
  const expected = {
    ...content,
    answer: String.raw`答案为 \(x=\frac{1}{2}\)。`,
    approach: '第一行\n第二行\t"核对"：保留 Unicode 中文。',
    steps: [{ title: "计算", content: String.raw`\[x=\frac{1}{2}\]；\(\text{结果}\)；\(\beta+\theta\)。` }],
  };
  let mixed = JSON.stringify(expected);
  for (const command of ["(", ")", "frac", "text", "beta", "theta"])
    mixed = mixed.replaceAll("\\\\" + command, "\\" + command);
  mixed = mixed.replace("Unicode", "\\u0055nicode");
  const result = await generateExplanation({ questionText: "x", educationStage: "初中" },
    { ...config, apiStyle: "chat_completions", strictJsonSchema: false }, undefined,
    async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: mixed } }] }));
  assert.deepEqual(result, expected);
});

test("拒绝截断的解题响应，即使截断前的 JSON 看起来完整", async () => {
  for (const finishReason of ["length", "content_filter", "insufficient_system_resource"]) {
    await assert.rejects(generateExplanation({ questionText: "x", educationStage: "初中" },
      { ...config, apiStyle: "chat_completions", strictJsonSchema: false }, undefined,
      async () => Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(content) } }] })), /未完成/);
  }
  await assert.rejects(generateExplanation({ questionText: "x", educationStage: "初中" }, config, undefined,
    async () => Response.json({ output_text: JSON.stringify(content).slice(0, -1) })), /格式不完整/);
});

test("非严格模型字段缺失时只重试一次，仍缺失则拒绝保存", async () => {
  const compatible = { ...config, apiStyle: "chat_completions", strictJsonSchema: false };
  let calls = 0;
  const fetched: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body)); assert.match(body.messages[0].content, /所有九个顶层字段/);
    if (calls === 2) assert.match(body.messages[0].content, /上次响应结构不完整/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(calls === 1 ? { answer: "x=1" } : content) } }] });
  };
  assert.deepEqual(await generateExplanation({ questionText: "x", educationStage: "初中" }, compatible, undefined, fetched), content);
  assert.equal(calls, 2);
  let failures = 0;
  await assert.rejects(generateExplanation({ questionText: "x", educationStage: "初中" }, compatible, undefined, async () => {
    failures++; return Response.json({ choices: [{ message: { content: '{"answer":"x=1"}' } }] });
  }), /格式不完整/);
  assert.equal(failures, 2);
});

test("取消和损坏的模型输出不会成为完整解法", async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(generateExplanation({ questionText: "x", educationStage: "初中" }, config, abort.signal, async () => { throw new DOMException("abort", "AbortError"); }), /取消/);
  await assert.rejects(generateExplanation({ questionText: "x", educationStage: "初中" }, config, undefined, async () => Response.json({ output_text: JSON.stringify({ ...content, steps: [] }) })), /格式不完整/);
});

test("解析保存拒绝过期版本、跨学生写入、删除后写入，并保持分类不变", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec(`INSERT INTO students(id,name) VALUES(1,'fixture'),(2,'other');
    INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification)
    VALUES(1,1,'fixture','fixture','image/png','展开 (x+3)²','x','x','x','x','{}','{"preserve":true}');`);
  const save = (revision: number, student = 1, value = content) => db.prepare(saveExplanationSql).get(1, JSON.stringify(value), "展开 (x+3)²", "ai", "fixture", 0, "2026-10-04T08:00:00Z", revision, 1, 1, student, revision);
  assert.equal(save(2), undefined, "Missing record cannot be silently recreated with an old revision");
  assert.equal(save(0, 2), undefined);
  assert.equal(save(0)?.revision, 1);
  assert.equal(save(0), undefined, "Concurrent first save must not overwrite");
  assert.equal(save(1, 2), undefined);
  assert.equal(save(1, 1, { ...content, answer: "教师修订" })?.revision, 2);
  assert.equal(save(1), undefined, "Stale teacher page must not overwrite");
  assert.equal(JSON.parse(String(db.prepare("SELECT content FROM question_explanations").get()!.content)).answer, "教师修订");
  assert.equal(db.prepare("SELECT teacher_confirmed_classification FROM questions").get()!.teacher_confirmed_classification, '{"preserve":true}');
  db.exec("UPDATE students SET deleted_at='2026-10-04' WHERE id=1");
  assert.equal(save(2), undefined);
  db.exec("UPDATE students SET deleted_at=NULL WHERE id=1; UPDATE questions SET deleted_at='2026-10-04' WHERE id=1");
  assert.equal(save(2), undefined);
  db.exec("DELETE FROM questions WHERE id=1");
  assert.equal(db.prepare("SELECT count(*) AS n FROM question_explanations").get()!.n, 0);
  db.close();
});
