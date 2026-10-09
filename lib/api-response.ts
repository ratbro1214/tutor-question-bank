/** Read API errors even when the server responds with plain text or HTML. */
export async function readApiResponse<T>(response: Response): Promise<T> {
 const text = await response.text();
 let data: unknown;
 try { data = JSON.parse(text); } catch { /* Framework errors may not be JSON. */ }
 if (!response.ok) {
  if (response.status === 413) throw Error('上传请求过大，请确认每份 PDF 不超过 40MB；若文件在限制内，请检查服务上传大小配置。');
  const error = data && typeof data === 'object' && 'error' in data ? (data as { error: unknown }).error : undefined;
  throw Error(typeof error === 'string' && error ? error : `请求失败（HTTP ${response.status}），请重试。`);
 }
 if (data === undefined) throw Error('服务器返回了无法识别的响应，请刷新页面后重试。');
 return data as T;
}
