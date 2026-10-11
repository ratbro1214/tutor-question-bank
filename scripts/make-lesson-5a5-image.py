"""Self-authored test chart; never reads application or student data."""
from PIL import Image, ImageDraw
from pathlib import Path

target = Path(__file__).resolve().parents[2] / 'work' / '5A-5'
target.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (640, 340), 'white')
draw = ImageDraw.Draw(image)
draw.text((20, 12), 'TEST ONLY - self-authored chart: f(x) = x^3 - 3x', fill='black')
draw.text((20, 30), 'Auxiliary chart; all problem conditions are in the text.', fill='black')

def point(x, y):
    return 320 + x * 105, 190 - y * 28

draw.line([(70, 190), (570, 190)], fill='black', width=2)
draw.line([(320, 65), (320, 310)], fill='black', width=2)
for x in [-2, -1, 0, 1, 2]:
    px, py = point(x, 0)
    draw.line([(px, py - 4), (px, py + 4)], fill='black')
    draw.text((px - 5, py + 6), str(x), fill='black')
draw.line([point(-2 + i / 100, (-2 + i / 100)**3 - 3 * (-2 + i / 100)) for i in range(401)], fill='#2358a4', width=3)
image.save(target / 'TEST-ONLY-original.png')
