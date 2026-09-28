export type AnalysisFailure = {
  message: string;
  retryable: boolean;
  upstreamStatus?: number;
  providerRequestId?: string;
  providerReferenceId?: string;
};

export class AnalysisUpstreamError extends Error {
  readonly retryable: boolean;
  readonly providerRequestId?: string;

  constructor(readonly status: number, headers: Headers, readonly providerReferenceId?: string) {
    const providerRequestId = readProviderRequestId(headers);
    super(upstreamMessage(status));
    this.name = "AnalysisUpstreamError";
    this.retryable = isRetryableUpstreamStatus(status);
    this.providerRequestId = providerRequestId;
  }
}

export function isRetryableUpstreamStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function upstreamMessage(status: number) {
  if (status === 401 || status === 403) return "AI 服务认证或模型权限配置异常，请检查服务密钥与模型权限。";
  if (status === 408) return "AI 服务处理超时，请稍后重试。";
  if (status === 429) return "AI 服务当前请求较多，请稍后重试。";
  if (status >= 500) return "AI 服务暂时不可用，请稍后重试。";
  if (status === 400 || status === 404 || status === 422) return "AI 服务拒绝了当前识别请求，请检查模型、接口地址或请求配置。";
  return "AI 识别请求失败。";
}

function readProviderRequestId(headers: Headers) {
  for (const name of ["x-request-id", "request-id", "x-grok-request-id", "x-groq-request-id", "xai-request-id"]) {
    const value = headers.get(name)?.trim();
    if (value && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)) return value;
  }
  return undefined;
}

export function classifyAnalysisFailure(error: unknown): AnalysisFailure {
  if (error instanceof AnalysisUpstreamError) {
    return {
      message: `${error.message}（上游状态 ${error.status}）`,
      retryable: error.retryable,
      upstreamStatus: error.status,
      providerRequestId: error.providerRequestId,
      providerReferenceId: error.providerReferenceId,
    };
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return { message: "AI 模型在 120 秒内没有返回完整结果，本次识别已停止。可以稍后重试，或先人工填写并归档。", retryable: true };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { message: "本次 AI 识别已取消，图片和已填写内容均已保留。", retryable: true };
  }
  if (error instanceof SyntaxError) return { message: "模型返回格式无效，可重试识别或改为人工填写。", retryable: true };
  if (error instanceof TypeError) return { message: "无法连接 AI 识别服务，请检查网络后重试。", retryable: true };
  const message = error instanceof Error ? error.message : "识别失败。";
  const providerReferenceId = providerReferenceFromText(message);
  if (providerReferenceId) return { message: "AI 识别服务返回了内部错误。", retryable: true, providerReferenceId };
  return { message, retryable: false };
}

export function providerReferenceFromText(text: string) {
  const reference = text.match(/internal error;\s*reference\s*=\s*([a-z0-9_-]{6,128})/i)?.[1];
  return reference && /^[a-z0-9_-]{6,128}$/i.test(reference) ? reference : undefined;
}
