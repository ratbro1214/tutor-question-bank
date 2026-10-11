"""MinerU 4.0 line geometry adapter. Uses installed local models only.

The public Middle JSON merges several questions into paragraphs. Capture the
engine's existing OCR lines before that merge; do not invent positions from text.
The hook is deliberately version checked and fails closed on incompatible APIs.
"""
import json
import sys
from pathlib import Path
import re

from mineru.version import __version__
from mineru.parser import parse
from mineru.backend.analysis.pdf import window
from docvortex.document.pdf import PDFDocument
from mineru.model.runtime.hybrid import HybridLocalModelContextSingleton

def main():
    if not __version__.startswith("4.0."):
        raise RuntimeError("本地 MinerU 版本不兼容，请更新行坐标适配器。")

    pages = []
    original = window._fill_window_block_content_and_lines

    def capture(images, pdf_pages, model_list, formulas, ocr_rows, *args, **kwargs):
        for image, rows in zip(images, ocr_rows):
            width, height = image["img_pil"].size
            items = []
            for row in rows:
                text = str(row.get("text", "")).strip()
                x0, y0, x1, y1 = row["bbox"]
                if text:
                    items.append(dict(text=text, x=x0, y=y0, width=x1-x0, height=y1-y0))
            pages.append(dict(page=len(pages)+1, width=width, height=height, items=items))
        return original(images, pdf_pages, model_list, formulas, ocr_rows, *args, **kwargs)

    window._fill_window_block_content_and_lines = capture
    try:
        result = parse(sys.argv[1], tier="flash", ocr_mode="ocr")
    finally:
        window._fill_window_block_content_and_lines = original

    if not pages or len(pages) != len(result.pages):
        raise RuntimeError("本地识别未返回完整行坐标，未保存不可靠切割。")

    # Re-read heading numbers at higher resolution. This fixes thin leading digits
    # without guessing a number from its neighbouring questions or document order.
    document = PDFDocument(Path(sys.argv[1]).read_bytes())
    try:
        model = HybridLocalModelContextSingleton().get_model().ocr_model
        for page in pages:
            for item in page["items"]:
                if item["x"]/page["width"] > .08 or not re.match(r"\s*\d{1,3}[.、．]\s*(?:答案|命题)", item["text"]):
                    continue
                y = item["y"]/page["height"]
                bottom = (item["y"]+item["height"])/page["height"]
                image = document.render_image(page["page"]-1, bbox=[.02, max(0,y-.004), .28, min(1,bottom+.004)], scale=4, image_format="png")
                rows = model.ocr(image.data)[0] or []
                for _, recognition in rows:
                    found = re.match(r"\s*(\d{1,3})[.、．]\s*(?:答案|命题)", recognition[0])
                    if found and recognition[1] >= .8:
                        item["text"] = re.sub(r"^\s*\d{1,3}[.、．]", found[1]+".", item["text"])
                        break
    finally:
        document.close()

    Path(sys.argv[2]).write_text(json.dumps(dict(pages=pages, engine="MinerU-"+__version__, method="local_ocr"), ensure_ascii=False), encoding="utf-8")


if __name__ == '__main__':
    main()
