import assert from "node:assert/strict";
import test from "node:test";
import { rankSimilarQuestions } from "../lib/question-similarity";

const target = {
  chapterCode: "ALG-EQUATION",
  extractedQuestion: "解方程：3x + 5 = 20，求 x 的值。",
  knowledgePointCodes: ["ALG-ONE-VARIABLE-EQUATION"],
};

test("suggests near-duplicate wording in the same chapter for teacher review", () => {
  const result = rankSimilarQuestions(target, [{
    id: 7,
    chapterCode: "ALG-EQUATION",
    chapterName: "一元一次方程",
    extractedQuestion: "解方程 3x+5=20，求x。",
    knowledgePointCodes: ["ALG-ONE-VARIABLE-EQUATION"],
  }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 7);
  assert.ok(result[0].similarity >= 38);
});

test("does not suggest a question merely because its chapter and tags match", () => {
  const result = rankSimilarQuestions(target, [{
    id: 8,
    chapterCode: "ALG-EQUATION",
    chapterName: "一元一次方程",
    extractedQuestion: "小明购买了几本练习册，每本售价不同，请列式解答。",
    knowledgePointCodes: ["ALG-ONE-VARIABLE-EQUATION"],
  }]);

  assert.deepEqual(result, []);
});

test("matches a shorter OCR variant against an archived question", () => {
  const result = rankSimilarQuestions({
    chapterCode: "FUNC-LINEAR",
    extractedQuestion: "解方程 3x+5=20，求x。",
    knowledgePointCodes: ["FUNC-LINEAR-EXPR"],
  }, [{
    id: 10,
    chapterCode: "FUNC-LINEAR",
    chapterName: "一次函数",
    extractedQuestion: "解方程：3x + 5 = 20，求 x 的值。",
    knowledgePointCodes: ["FUNC-LINEAR-EXPR"],
  }]);

  assert.equal(result[0]?.id, 10);
});

test("skips short text that produces unreliable character similarity", () => {
  const result = rankSimilarQuestions({
    chapterCode: "ALG-EQUATION",
    extractedQuestion: "求 x。",
    knowledgePointCodes: ["ALG-ONE-VARIABLE-EQUATION"],
  }, [{
    id: 9,
    chapterCode: "ALG-EQUATION",
    chapterName: "一元一次方程",
    extractedQuestion: "求x的值是多少？",
    knowledgePointCodes: ["ALG-ONE-VARIABLE-EQUATION"],
  }]);

  assert.deepEqual(result, []);
});
