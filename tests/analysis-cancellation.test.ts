import test from "node:test";
import assert from "node:assert/strict";
import { cancelAnalysis, registerAnalysis, unregisterAnalysis } from "../lib/analysis-cancellation";

test("取消任务会中止对应的上游 AbortController", () => {
  const controller = new AbortController();
  registerAnalysis("analysis-test", controller);
  assert.equal(cancelAnalysis("analysis-test"), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(cancelAnalysis("analysis-test"), false);
});

test("完成任务后注销，不会误取消其他请求", () => {
  const controller = new AbortController();
  registerAnalysis("analysis-finished", controller);
  unregisterAnalysis("analysis-finished");
  assert.equal(cancelAnalysis("analysis-finished"), false);
  assert.equal(controller.signal.aborted, false);
});
