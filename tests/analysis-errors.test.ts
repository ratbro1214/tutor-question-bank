import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisUpstreamError, classifyAnalysisFailure, providerReferenceFromText } from "../lib/analysis-errors";

test("marks temporary upstream failures retryable and keeps a safe request reference", () => {
  const failure = classifyAnalysisFailure(new AnalysisUpstreamError(503, new Headers({ "x-request-id": "req_abc-123" })));

  assert.equal(failure.retryable, true);
  assert.equal(failure.upstreamStatus, 503);
  assert.equal(failure.providerRequestId, "req_abc-123");
  assert.match(failure.message, /暂时不可用/);
});

test("does not recommend retrying authentication or malformed-request failures", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const failure = classifyAnalysisFailure(new AnalysisUpstreamError(status, new Headers()));
    assert.equal(failure.retryable, false, `status ${status}`);
    assert.doesNotMatch(failure.message, /Bearer|token|api[_ -]?key/i);
  }
});

test("retries rate limits, request timeouts, server errors, and network failures", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(classifyAnalysisFailure(new AnalysisUpstreamError(status, new Headers())).retryable, true, `status ${status}`);
  }
  assert.equal(classifyAnalysisFailure(new TypeError("fetch failed")).retryable, true);
});

test("ignores malformed upstream request identifiers", () => {
  const failure = classifyAnalysisFailure(new AnalysisUpstreamError(500, new Headers({ "x-request-id": "bad reference" })));
  assert.equal(failure.providerRequestId, undefined);
});

test("extracts only the support reference from a provider internal-error body", () => {
  assert.equal(providerReferenceFromText('{"error":"internal error; reference = 1jke0ne94p4jut5dne3h2mj"}'), "1jke0ne94p4jut5dne3h2mj");
  const failure = classifyAnalysisFailure(new Error("internal error; reference = 1jke0ne94p4jut5dne3h2mj"));
  assert.equal(failure.providerReferenceId, "1jke0ne94p4jut5dne3h2mj");
  assert.equal(failure.retryable, true);
  assert.doesNotMatch(failure.message, /1jke0ne/);
});

test("distinguishes model timeout from an actively cancelled request", () => {
  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  const cancelled = new Error("cancelled");
  cancelled.name = "AbortError";

  assert.match(classifyAnalysisFailure(timeout).message, /120 秒/);
  assert.doesNotMatch(classifyAnalysisFailure(timeout).message, /已取消/);
  assert.match(classifyAnalysisFailure(cancelled).message, /已取消/);
});
