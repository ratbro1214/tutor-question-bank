import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { buildQuestionCrops, locateQuestionAnchors, parseQuestionSelection, cropRegionSchema, type PaperPage } from "../lib/paper";
import { readExplanationDraft, explanationDraftKey } from "../lib/explanation-draft";
import { emptyExplanation } from "../lib/question-explanation";

test("指定题号支持中文分隔符和范围，缺失题号明确报错", () => {
  const available = [1, 2, 3, 4, 7, 8, 9];
  assert.deepEqual(parseQuestionSelection("1，3、7-9", available), [1, 3, 7, 8, 9]);
  assert.deepEqual(parseQuestionSelection("3,1,1", available), [1, 3]);
  assert.deepEqual(parseQuestionSelection("", available), available);
  for (const input of ["0", "9-7", "1,", "1-300", "(1)"]) assert.throws(() => parseQuestionSelection(input, available));
  assert.throws(() => parseQuestionSelection("5,8", available), /5/);
});
const item = (text: string, x: number, y: number, width = 140) => ({ text, x, y, width, height: 12 });
test("双栏题号定位排除小问、选项、小数、页码和年份", () => {
  const page: PaperPage = { page: 1, width: 1000, height: 1000, items: [
    item("1.", 40, 100, 12), item("Find x", 65, 100), item("2．Question", 540, 100),
    item("(1) Small question", 40, 200), item("A. 3", 40, 250), item("1.25", 40, 300), item("2026. Exam", 40, 400), item("1", 450, 980),
  ] };
  assert.deepEqual(locateQuestionAnchors([page]).map(a => a.number), [1, 2]);
  const crops = buildQuestionCrops([page], locateQuestionAnchors([page]));
  assert.equal(crops[0].regions[0].width, .48);
  assert.equal(crops[1].regions[0].x, .5);
  assert.match(crops[0].text, /Small question/);
});
test("跨页题合并续页片段，参考答案不进入题目裁切", () => {
  const pages: PaperPage[] = [
    { page: 1, width: 1000, height: 1000, items: [item("1. Question", 40, 100), item("2. Long question", 40, 650)] },
    { page: 2, width: 1000, height: 1000, items: [item("Continuation and diagram", 40, 100), item("3. Question", 40, 500)] },
    { page: 3, width: 1000, height: 1000, items: [item("参考", 40, 50, 25), item("答案", 66, 50, 25), item("1. Answer", 40, 100)] },
  ];
  const crops = buildQuestionCrops(pages, locateQuestionAnchors(pages));
  assert.deepEqual(crops.map(c => c.number), [1, 2, 3]);
  assert.deepEqual(crops[1].regions.map(r => r.page), [1, 2]);
  assert.match(crops[1].text, /Continuation/);
  assert.ok(crops.every(c => c.regions.every(r => r.page !== 3 && cropRegionSchema.safeParse(r).success)));
});
test("双栏跨页按左栏、右栏、下一页排序，小问不会分成新题", () => {
  const pages: PaperPage[] = [
    { page: 1, width: 1000, height: 1000, items: [item("1. Q", 40, 100), item("2. Q", 540, 100), item("(1) sub", 540, 500)] },
    { page: 2, width: 1000, height: 1000, items: [item("continuation", 40, 100), item("3. Q", 40, 500), item("4. Q", 540, 200)] },
  ];
  const crops = buildQuestionCrops(pages, locateQuestionAnchors(pages));
  assert.deepEqual(crops[1].regions.map(r => [r.page, r.x]), [[1, .5], [2, .02]]);
  assert.match(crops[1].text, /sub/);
  assert.equal(crops.length, 4);
  assert.equal(cropRegionSchema.safeParse({ page: 1, x: .7, y: .2, width: .4, height: .2 }).success, false);
});
test("编辑未完成的解析可恢复，本机草稿按学生和题目隔离", () => {
  const draft = { content: { ...emptyExplanation, steps: [{ title: "", content: "未完成" }] }, sourceText: "题目", origin: "manual", model: "", reviewed: false, baseRevision: 1 };
  assert.deepEqual(readExplanationDraft(JSON.stringify(draft)), draft);
  assert.equal(readExplanationDraft("bad json"), null);
  assert.equal(readExplanationDraft(JSON.stringify({ content: "broken" })), null);
  assert.notEqual(explanationDraftKey("1", 1), explanationDraftKey("2", 1));
});
test("套卷数据库限制同卷重复题号和重复文件，逐题保存状态独立", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter(n => n.endsWith(".sql")).sort()) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec("INSERT INTO papers VALUES('p','exam','file.pdf','source','application/pdf','hash','2026-10-04');");
  assert.throws(() => db.exec("INSERT INTO papers VALUES('p2','exam2','file.pdf','source2','application/pdf','hash','2026-10-04');"));
  const add = db.prepare("INSERT INTO paper_questions(id,paper_id,question_number,regions,image_key,updated_at) VALUES(?,'p',?,'[]','image','2026-10-04')");
  add.run("q1", 1); add.run("q2", 2); assert.throws(() => add.run("q3", 1));
  db.exec("UPDATE paper_questions SET explanation='{}',status='ready' WHERE id='q1'; UPDATE paper_questions SET status='failed',error='retry' WHERE id='q2';");
  assert.equal(db.prepare("SELECT count(*) AS n FROM paper_questions WHERE explanation IS NOT NULL").get()!.n, 1);
  db.close();
});
