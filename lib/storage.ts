import { env } from "cloudflare:workers";

export function getBucket() {
  if (!env.BUCKET) throw new Error("图片存储暂不可用，请稍后重试。");
  return env.BUCKET;
}
