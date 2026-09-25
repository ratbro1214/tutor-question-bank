export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "发生未知错误";
  if (message.includes("binding `DB`") || message.includes("no such table")) return "题库数据库尚未完成初始化，请稍后重试。";
  return message;
}
