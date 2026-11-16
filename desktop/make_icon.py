# Draws the app icon (no logos: a car seen from above at the end of a gold skid arc on the game's ink colour).
# usage: python3 make_icon.py out.png out.ico
import math, sys
from PIL import Image, ImageDraw

S = 1024
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.22, fill=(27, 26, 28, 255))
# gold skid arc from the bottom-left sweeping up to the right
for w, col in ((150, (242, 194, 48, 110)), (96, (242, 194, 48, 255))):
    d.arc((-S * 0.55, S * 0.18, S * 1.05, S * 1.7), start=200, end=330, fill=col, width=w)
# the car at the end of the arc, turned into the slide
car = Image.new('RGBA', (S, S), (0, 0, 0, 0))
cd = ImageDraw.Draw(car)
cx, cy, cw, ch = S * 0.68, S * 0.34, S * 0.19, S * 0.36
cd.rounded_rectangle((cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2), radius=cw * 0.3, fill=(246, 234, 211, 255))
cd.rounded_rectangle((cx - cw * 0.36, cy - ch * 0.22, cx + cw * 0.36, cy + ch * 0.1), radius=cw * 0.12, fill=(27, 26, 28, 255))      # glass
cd.rectangle((cx - cw * 0.42, cy + ch * 0.42, cx - cw * 0.18, cy + ch * 0.5), fill=(200, 32, 43, 255))      # tail lamps
cd.rectangle((cx + cw * 0.18, cy + ch * 0.42, cx + cw * 0.42, cy + ch * 0.5), fill=(200, 32, 43, 255))
car = car.rotate(-28, resample=Image.BICUBIC, center=(cx, cy))
im.alpha_composite(car)
im.resize((256, 256), Image.LANCZOS).save(sys.argv[1])
im.save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icon written')
