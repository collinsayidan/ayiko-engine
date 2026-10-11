"""
Renders the demo product shot (samples/sample-product.jpg): an amber glass
serum bottle on a podium in a soft studio scene. Drawn at 2x and scaled down
for clean edges. Only needed if you want to regenerate the sample:

    python scripts/make-sample.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 2  # supersampling
W, H = 1080 * S, 1920 * S
random.seed(7)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def vgradient(size, top, bottom):
    w, h = size
    g = Image.new("RGB", (1, h))
    for y in range(h):
        g.putpixel((0, y), lerp(top, bottom, y / (h - 1)))
    return g.resize((w, h))


def hgradient(size, stops):
    """stops: list of (pos 0..1, (r,g,b,a))"""
    w, h = size
    g = Image.new("RGBA", (w, 1))
    for x in range(w):
        t = x / max(1, w - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                g.putpixel((x, 0), lerp(c0, c1, (t - p0) / max(1e-6, p1 - p0)))
                break
    return g.resize((w, h))


def glow(size, center, radius, color, blur):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = center
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def rounded_mask(size, box, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, r, fill=255)
    return m


# ---------- backdrop: dusk studio, cobalt to violet with a warm key light ----------
img = vgradient((W, H), (22, 24, 62), (8, 8, 20)).convert("RGBA")
img = Image.alpha_composite(img, glow((W, H), (W * 0.5, H * 0.36), 760 * S, (84, 104, 255, 150), 260 * S))
img = Image.alpha_composite(img, glow((W, H), (W * 0.72, H * 0.24), 360 * S, (255, 170, 110, 70), 200 * S))
img = Image.alpha_composite(img, glow((W, H), (W * 0.2, H * 0.6), 300 * S, (69, 211, 232, 45), 200 * S))

# arch window light on the back wall
arch = Image.new("L", (W, H), 0)
ad = ImageDraw.Draw(arch)
aw, ah, ax, ay = 620 * S, 1100 * S, W // 2, int(H * 0.12)
ad.rounded_rectangle((ax - aw // 2, ay, ax + aw // 2, ay + ah), aw // 2, fill=60)
arch = arch.filter(ImageFilter.GaussianBlur(40 * S))
img = Image.composite(Image.new("RGBA", (W, H), (150, 160, 255, 255)), img, arch)

# ---------- bokeh (behind everything) ----------
fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
fd = ImageDraw.Draw(fx)
for _ in range(26):
    x, y = random.uniform(0, W), random.uniform(0, H * 0.85)
    rr = random.uniform(6, 26) * S
    a = random.randint(25, 80)
    fd.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(200, 210, 255, a))
img = Image.alpha_composite(img, fx.filter(ImageFilter.GaussianBlur(6 * S)))



# ---------- podium ----------
cx = W // 2
top_y = int(H * 0.66)
pw, ph_top, depth = 760 * S, 120 * S, 260 * S
side = Image.new("RGBA", (W, H), (0, 0, 0, 0))
body = hgradient((pw, depth), [(0, (40, 42, 90, 255)), (0.35, (88, 96, 190, 255)), (0.6, (60, 64, 140, 255)), (1, (26, 26, 60, 255))])
side.paste(body, (cx - pw // 2, top_y), body)
ImageDraw.Draw(side).ellipse((cx - pw // 2, top_y + depth - ph_top // 2, cx + pw // 2, top_y + depth + ph_top // 2), fill=(26, 27, 64, 255))
sm = Image.new("L", (W, H), 0)
smd = ImageDraw.Draw(sm)
smd.rectangle((cx - pw // 2, top_y, cx + pw // 2, top_y + depth), fill=255)
smd.ellipse((cx - pw // 2, top_y + depth - ph_top // 2, cx + pw // 2, top_y + depth + ph_top // 2), fill=255)
img = Image.composite(side, img, sm)
topface = Image.new("RGBA", (W, H), (0, 0, 0, 0))
tf = ImageDraw.Draw(topface)
tf.ellipse((cx - pw // 2, top_y - ph_top // 2, cx + pw // 2, top_y + ph_top // 2), fill=(118, 128, 230, 255))
tf.ellipse((cx - pw // 2 + 30 * S, top_y - ph_top // 2 + 10 * S, cx + pw // 2 - 30 * S, top_y + ph_top // 2 - 6 * S), fill=(134, 144, 240, 255))
img = Image.alpha_composite(img, topface.filter(ImageFilter.GaussianBlur(2 * S)))

# ---------- bottle ----------
bw, bh = 300 * S, 470 * S
bx0, by1 = cx - bw // 2, top_y + 8 * S
by0 = by1 - bh
r = 70 * S

# contact shadow
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).ellipse((cx - bw * 0.62, by1 - 26 * S, cx + bw * 0.62, by1 + 22 * S), fill=(5, 5, 20, 200))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(16 * S)))

# amber glass body
mask = rounded_mask((W, H), (bx0, by0, bx0 + bw, by1), r)
glass = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = hgradient((bw, bh), [(0, (120, 52, 14, 255)), (0.18, (214, 120, 40, 255)), (0.45, (176, 86, 24, 255)), (0.78, (132, 58, 16, 255)), (1, (70, 28, 8, 255))])
glass.paste(g, (bx0, by0))
img = Image.composite(glass, img, mask)
# liquid line and inner glow
inner = Image.new("RGBA", (W, H), (0, 0, 0, 0))
idr = ImageDraw.Draw(inner)
idr.rounded_rectangle((bx0 + 22 * S, by0 + 120 * S, bx0 + bw - 22 * S, by1 - 22 * S), r - 22 * S, fill=(255, 170, 70, 70))
inner = inner.filter(ImageFilter.GaussianBlur(18 * S))
img = Image.composite(Image.alpha_composite(img, inner), img, mask)
# highlights (glass reflections)
hl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(hl)
hd.rounded_rectangle((bx0 + 34 * S, by0 + 40 * S, bx0 + 64 * S, by1 - 60 * S), 15 * S, fill=(255, 236, 210, 170))
hd.rounded_rectangle((bx0 + 82 * S, by0 + 60 * S, bx0 + 92 * S, by1 - 120 * S), 5 * S, fill=(255, 236, 210, 90))
hd.rounded_rectangle((bx0 + bw - 48 * S, by0 + 70 * S, bx0 + bw - 36 * S, by1 - 90 * S), 6 * S, fill=(255, 200, 150, 70))
img = Image.composite(Image.alpha_composite(img, hl.filter(ImageFilter.GaussianBlur(4 * S))), img, mask)
# rim light outline
rim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(rim).rounded_rectangle((bx0, by0, bx0 + bw, by1), r, outline=(255, 210, 160, 120), width=3 * S)
img = Image.alpha_composite(img, rim.filter(ImageFilter.GaussianBlur(1 * S)))

# label
lw, lh = 210 * S, 190 * S
lx0, ly0 = cx - lw // 2, by0 + 175 * S
label = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(label)
ld.rounded_rectangle((lx0, ly0, lx0 + lw, ly0 + lh), 10 * S, fill=(246, 240, 230, 245))
font_dir = Path(__file__).resolve().parent.parent / "assets" / "fonts"
f_big = ImageFont.truetype(str(font_dir / "Inter_900Black.ttf"), 54 * S)
f_small = ImageFont.truetype(str(font_dir / "Inter_600SemiBold.ttf"), 17 * S)
f_tiny = ImageFont.truetype(str(font_dir / "Inter_600SemiBold.ttf"), 13 * S)
ld.text((cx, ly0 + 56 * S), "AMA", font=f_big, fill=(28, 24, 60, 255), anchor="mm")
ld.line((cx - 40 * S, ly0 + 96 * S, cx + 40 * S, ly0 + 96 * S), fill=(84, 104, 255, 255), width=3 * S)
ld.text((cx, ly0 + 122 * S), "GLOW SERUM", font=f_small, fill=(28, 24, 60, 255), anchor="mm")
ld.text((cx, ly0 + 152 * S), "shea · vitamin C · 30 ml", font=f_tiny, fill=(100, 96, 130, 255), anchor="mm")
img = Image.alpha_composite(img, label)

# shoulders, neck and dropper cap
cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(cap)
nw = 120 * S
cd.rounded_rectangle((cx - nw // 2, by0 - 30 * S, cx + nw // 2, by0 + 14 * S), 10 * S, fill=(30, 28, 40, 255))
cw, chh = 110 * S, 110 * S
capimg = hgradient((cw, chh), [(0, (20, 20, 28, 255)), (0.3, (70, 70, 84, 255)), (0.5, (40, 40, 50, 255)), (1, (12, 12, 18, 255))])
cm = rounded_mask((W, H), (cx - cw // 2, by0 - 30 * S - chh, cx + cw // 2, by0 - 26 * S), 14 * S)
cap.paste(capimg, (cx - cw // 2, by0 - 30 * S - chh))
img = Image.composite(cap, img, ImageChops.lighter(cm, rounded_mask((W, H), (cx - nw // 2, by0 - 30 * S, cx + nw // 2, by0 + 14 * S), 10 * S)))
bulb_w = 74 * S
bulb = hgradient((bulb_w, 150 * S), [(0, (190, 196, 220, 255)), (0.35, (250, 250, 255, 255)), (1, (150, 154, 180, 255))])
bm = rounded_mask((W, H), (cx - bulb_w // 2, by0 - 30 * S - chh - 140 * S, cx + bulb_w // 2, by0 - 30 * S - chh + 10 * S), bulb_w // 2)
bl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bl.paste(bulb, (cx - bulb_w // 2, by0 - 30 * S - chh - 140 * S))
img = Image.composite(bl, img, bm)

# ---------- floating shea leaves ----------
def leaf(center, length, angle, color):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld2 = ImageDraw.Draw(lay)
    x, y = center
    pts = []
    for i in range(41):
        t = i / 40
        wv = math.sin(math.pi * t) * length * 0.22
        pts.append((t * length - length / 2, wv))
    pts += [(px, -py) for px, py in reversed(pts)]
    ca, sa = math.cos(angle), math.sin(angle)
    ld2.polygon([(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in pts], fill=color)
    ld2.line([(x - length / 2 * ca, y - length / 2 * sa), (x + length / 2 * ca, y + length / 2 * sa)], fill=(20, 60, 40, 160), width=2 * S)
    return lay


for c, ln, an, col, bl_r in [
    ((cx - 330 * S, top_y - 40 * S), 220 * S, -0.6, (52, 150, 96, 255), 0),
    ((cx + 320 * S, top_y - 10 * S), 180 * S, 0.5, (40, 128, 82, 255), 0),
    ((cx + 360 * S, int(H * 0.2)), 140 * S, 1.1, (52, 150, 96, 200), 10 * S),
    ((cx - 380 * S, int(H * 0.3)), 120 * S, -1.0, (40, 128, 82, 170), 14 * S),
]:
    lay = leaf(c, ln, an, col)
    img = Image.alpha_composite(img, lay.filter(ImageFilter.GaussianBlur(bl_r)) if bl_r else lay)

# ---------- finish: vignette, downscale ----------
vig = Image.new("L", (W, H), 0)
ImageDraw.Draw(vig).ellipse((-W * 0.25, -H * 0.1, W * 1.25, H * 1.1), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(220 * S))
img = Image.composite(img, Image.new("RGBA", (W, H), (4, 4, 12, 255)), vig)

out = img.convert("RGB").resize((W // S, H // S), Image.LANCZOS)
dest = Path(__file__).resolve().parent.parent / "samples" / "sample-product.jpg"
dest.parent.mkdir(exist_ok=True)
out.save(dest, quality=92)
print(f"saved {dest}")
