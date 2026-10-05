import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CropRegion, PaperPage } from "./paper";

export type PaperDocument = { pages: PaperPage[]; renderPage: (page: number) => Promise<HTMLCanvasElement>; destroy: () => Promise<void> };
export async function openPaperDocument(file: Blob): Promise<PaperDocument> {
  if (file.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0); bitmap.close();
    return { pages: [{ page: 1, width: canvas.width, height: canvas.height, items: [] }], renderPage: async () => canvas, destroy: async () => {} };
  }
  const pdfjs = await import("pdfjs-dist");
  // The matching worker and fonts are served locally in dev and production.
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.mjs?v=${pdfjs.version}`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
  const pdf: PDFDocumentProxy = await task.promise;
  if (pdf.numPages > 80) { await task.destroy(); throw new Error("一次支持最多 80 页，请先拆分 PDF。"); }
  const pages: PaperPage[] = [];
  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo), viewport = page.getViewport({ scale: 1 }), text = await page.getTextContent();
      const items = text.items.flatMap(item => {
        if (!("str" in item) || !item.str.trim()) return [];
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const height = Math.hypot(transform[2], transform[3]);
        return [{ text: item.str, x: transform[4], y: transform[5] - height, width: item.width, height }];
      });
      pages.push({ page: pageNo, width: viewport.width, height: viewport.height, items });
    }
  } catch (error) { await task.destroy(); throw error; }
  const rendered = new Map<number, Promise<HTMLCanvasElement>>();
  return { pages, renderPage: pageNo => {
    const cached = rendered.get(pageNo); if (cached) return cached;
    const pending = (async () => {
      const page = await pdf.getPage(pageNo), unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / unit.width, 3500 / unit.height) });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise; return canvas;
    })();
    rendered.set(pageNo, pending);
    if (rendered.size > 3) rendered.delete(rendered.keys().next().value!);
    return pending;
  }, destroy: () => { rendered.clear(); return task.destroy(); } };
}
export async function cropQuestionImage(doc: PaperDocument, regions: CropRegion[]): Promise<Blob> {
  if (!regions.length) throw new Error("请先指定裁切范围。");
  const parts = [];
  for (const region of regions) {
    const page = await doc.renderPage(region.page);
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(page.width * region.width)); canvas.height = Math.max(1, Math.round(page.height * region.height));
    canvas.getContext("2d")!.drawImage(page, page.width * region.x, page.height * region.y, page.width * region.width, page.height * region.height, 0, 0, canvas.width, canvas.height);
    // Remove entirely blank continuation fragments and excess vertical whitespace.
    // This uses rendered pixels, so diagrams without PDF text are retained.
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let first = canvas.height, last = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] > 16 && pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 730) { first = Math.min(first, y); last = y; break; }
      }
    }
    if (last < 0) continue;
    const top = Math.max(0, first - 14), bottom = Math.min(canvas.height, last + 15);
    const trimmed = document.createElement("canvas"); trimmed.width = canvas.width; trimmed.height = bottom - top;
    trimmed.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, trimmed.height, 0, 0, canvas.width, trimmed.height);
    parts.push(trimmed);
  }
  if (!parts.length) throw new Error("裁切范围内没有可见题目，请重新框选。");
  const width = Math.max(...parts.map(p => p.width)), height = parts.reduce((sum, p) => sum + p.height + 16, 0);
  const scale = Math.min(1, 16000 / height, 2200 / width);
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const part of parts) { context.drawImage(part, 0, y, part.width * scale, part.height * scale); y += (part.height + 16) * scale; }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("裁切图片生成失败。")), "image/jpeg", .92));
  if (blob.size > 8 * 1024 * 1024) throw new Error("单题裁切超过 8MB，请缩小范围。");
  return blob;
}
