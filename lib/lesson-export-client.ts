import type { ExportImage, LessonExportSnapshot } from './lesson-export';

export async function decodeExportImage(blob: Blob): Promise<Omit<ExportImage, 'id'>> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 40000000 || !bitmap.width || !bitmap.height) throw Error('原图像素过大或尺寸无效，请在题库核对图片。');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw Error('当前浏览器无法处理原图，请更换浏览器重试。');
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('原图转换失败。')), 'image/png'));
    return { data: new Uint8Array(await png.arrayBuffer()), width: bitmap.width, height: bitmap.height, type: 'png' };
  } finally { bitmap.close(); }
}
export async function loadLessonExportImages(snapshot: LessonExportSnapshot, signal: AbortSignal, decode = decodeExportImage, fetcher: typeof fetch = fetch) {
  const images: ExportImage[] = [], seen = new Set<string>(); let total = 0;
  for (const question of snapshot.questions) for (const reference of question.images) {
    signal.throwIfAborted();
    if (seen.has(reference.id)) continue;
    if (reference.url !== `/api/math-library/${question.canonicalId}/image/${reference.id}`) throw Error('题图引用不属于当前题库记录，导出已停止。');
    const response = await fetcher(reference.url, { cache: 'no-store', signal });
    if (!response.ok) throw Error('原始题图不存在或无权读取，导出已停止；教案内容保留。');
    const blob = await response.blob(); total += blob.size;
    if (blob.size > 12 * 1024 * 1024 || total > 48 * 1024 * 1024) throw Error('题图文件过大，请减少导出题目或核对原图后重试。');
    const image = await decode(blob); total += image.data.length;
    if (total > 96 * 1024 * 1024) throw Error('题图转换后过大，请减少所选题目。');
    images.push({ id: reference.id, ...image }); seen.add(reference.id);
  }
  signal.throwIfAborted(); return images;
}
