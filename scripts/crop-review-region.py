"""Geometry-only raster crop for review artifacts; no OCR/content classification."""
import json
import math
import sys
from PIL import Image

page_file, region_json, output_file = sys.argv[1:]
region = json.loads(region_json)
with Image.open(page_file) as image:
    width, height = image.size
    box = (max(0, math.floor(region['x'] * width)),
           max(0, math.floor(region['y'] * height)),
           min(width, math.ceil((region['x'] + region['width']) * width)),
           min(height, math.ceil((region['y'] + region['height']) * height)))
    if box[2] <= box[0] or box[3] <= box[1]:
        raise ValueError('Empty pixel crop')
    crop = image.crop(box)
    # Never overwrite an existing artifact, and never trim/reinterpret its content.
    with open(output_file, 'xb') as target:
        crop.save(target, format='PNG')
    print(json.dumps({'pixel_box': box, 'dimensions': crop.size, 'page_dimensions': image.size}))
