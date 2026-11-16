#!/usr/bin/env python3
"""Derives the small effect sheets Towercraft draws that Wyrmsun has no picture for, into towercraft/public/art/fx/ (own work, CC0):
  hit.png    6 frames of 32 px: a puff of dust where an arrow or bolt lands
  slash.png  6 frames of 48 px: a pale crescent cut across a victim (a melee blow); it bulges to the right, the game rotates it
  smoke.png  6 variants of 128 px: soft smoke and dust puffs from Wyrmsun's CC0 explosion sheet, lightened to white shading so the
             game can tint them (soot, ash or tan dust)
Run: python3 tools/towercraftFxArt.py   (needs Pillow; reads art/fx/explosion.png, which `npm run towercraft:art` copies first)"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'towercraft', 'public', 'art', 'fx')
SS = 4  # supersampling


def finish(layer, size):
    return layer.resize((size, size), Image.LANCZOS)


def puff(frame, n=6, size=32):
    rnd = random.Random(7)
    big = size * SS
    cloud = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(cloud)
    t = (frame + 1) / n
    blobs = 16
    for i in range(blobs):
        a = rnd.uniform(0, math.tau)
        reach = (0.10 + 0.22 * rnd.uniform(0.3, 1)) * big * (0.3 + 0.7 * math.sqrt(t))
        r = (0.12 + 0.07 * rnd.random()) * big * (0.55 + 0.7 * t)
        x = big / 2 + math.cos(a) * reach
        y = big / 2 + math.sin(a) * reach * 0.8 - t * big * 0.06
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    cloud = cloud.filter(ImageFilter.GaussianBlur(big * 0.03))
    alpha = cloud.point(lambda v: min(255, int(v * 1.1)))
    fade = (1 - t) ** 1.2 * 0.85 + 0.03
    alpha = alpha.point(lambda v: int(v * fade))
    # lit from above: lighter on top, a little darker below
    shade = Image.linear_gradient('L').resize((big, big)).point(lambda v: 255 - int(v * 0.35))
    rgb = Image.merge('RGB', [shade, shade, shade])
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return finish(out, size)


def slash(frame, n=6, size=48):
    big = size * SS
    c = Image.new('L', (big, big), 0)
    t = (frame + 0.5) / n
    cx, cy = big * 0.30, big * 0.5
    R = big * 0.46
    sweep0 = math.radians(-70)
    sweep1 = math.radians(-70 + 140 * min(1, t * 1.6))
    d = ImageDraw.Draw(c)
    steps = 40
    pts_out, pts_in = [], []
    for k in range(steps + 1):
        a = sweep0 + (sweep1 - sweep0) * k / steps
        w = math.sin(math.pi * k / steps) ** 0.8  # thick in the middle, pointed ends
        thick = big * 0.085 * w * (1 - 0.35 * t)
        pts_out.append((cx + math.cos(a) * (R + thick), cy + math.sin(a) * (R + thick)))
        pts_in.append((cx + math.cos(a) * (R - thick * 1.4), cy + math.sin(a) * (R - thick * 1.4)))
    d.polygon(pts_out + pts_in[::-1], fill=255)
    glow = c.filter(ImageFilter.GaussianBlur(big * 0.025))
    core = c.filter(ImageFilter.GaussianBlur(big * 0.008))
    a = Image.eval(glow, lambda v: v)
    fade = 1.0 if t < 0.5 else max(0.0, 1 - (t - 0.5) / 0.5)
    rgb = Image.new('RGB', (big, big), (255, 247, 226))
    out = rgb.convert('RGBA')
    mix = Image.blend(glow, core, 0.6).point(lambda v: int(min(255, v * 1.25) * fade))
    out.putalpha(mix)
    return finish(out, size)


def smoke_sheet():
    src = Image.open(os.path.join(OUT, 'explosion.png')).convert('RGBA')
    frames = []
    for i in (10, 12, 14, 16, 18, 20):
        x, y = (i % 5) * 64, (i // 5) * 64
        f = src.crop((x, y, x + 64, y + 64)).resize((128, 128), Image.BICUBIC)
        px = f.load()
        for yy in range(128):
            for xx in range(128):
                r, g, b, a = px[xx, yy]
                if a == 0:
                    continue
                lum = (r + g + b) / 3 / 255
                v = int(160 + 95 * min(1, lum * 3.2))
                v = min(255, v + int((64 - yy) * 0.35))  # a touch of light from above so a puff reads round
                px[xx, yy] = (v, v, v, a)
        f = f.filter(ImageFilter.GaussianBlur(1.3))
        al = f.getchannel('A').point(lambda v: min(255, int(v * 1.35)))
        f.putalpha(al)
        frames.append(f)
    sheet = Image.new('RGBA', (128 * len(frames), 128), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 128, 0))
    return sheet


def strip(frames, size):
    s = Image.new('RGBA', (size * len(frames), size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.paste(f, (i * size, 0))
    return s


if __name__ == '__main__':
    strip([puff(i) for i in range(6)], 32).save(os.path.join(OUT, 'hit.png'), optimize=True)
    strip([slash(i) for i in range(6)], 48).save(os.path.join(OUT, 'slash.png'), optimize=True)
    smoke_sheet().save(os.path.join(OUT, 'smoke.png'), optimize=True)
