"""Build the public pages' images from the game's own art and real captures.

    python3 site/tools/prep-assets.py [capturesDir]     (default: site-captures)

Reads public/ (tiles, sprites, backdrops), the logo from site/tools/logo.py,
and the captures from site/tools/capture.cjs; writes site/assets/{img,shots,video}
(and the game's own copy of the icons, public/favicon.png + apple-touch-icon.png).
Needs Pillow and numpy, and ffmpeg for the gameplay clip. The fonts in
site/assets/fonts are committed as they are (SIL Open Font License, from
@fontsource/jersey-15 and @fontsource/andika).
"""
import random
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SITE = Path(__file__).resolve().parent.parent
GAME = SITE.parent
PUB = GAME / 'public'
OUT = SITE / 'assets'
CAP = Path(sys.argv[1]) if len(sys.argv) > 1 else GAME / 'site-captures'
N = Image.NEAREST
for d in ('img', 'shots', 'video'):
    (OUT / d).mkdir(parents=True, exist_ok=True)


def frame(sheet, i, w=32, h=32):
    return Image.open(sheet).convert('RGBA').crop((i * w, 0, i * w + w, h))


def save_png(im, path, colors=None):
    if colors:
        im = im.convert('RGBA').quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    im.save(path, optimize=True)


# --- textures: a 3x3 mix of a tileset's ground frames (seeded, so rebuilds match)
def texture(zone, frames, name, n=3, seed=7):
    rnd = random.Random(seed)
    t = Image.new('RGBA', (32 * n, 32 * n))
    for y in range(n):
        for x in range(n):
            t.paste(frame(PUB / 'tiles' / f'{zone}.png', rnd.choice(frames)), (x * 32, y * 32))
    save_png(t, OUT / 'img' / f'{name}.png')


texture('lumina-village', [0, 1, 2], 'tex-grass')
texture('starfall-coast', [0, 1, 2], 'tex-sand')
texture('silver-shallows', [4], 'tex-water', n=1)
texture('silver-shallows', [5], 'tex-water-2', n=1)
texture('verdara', [0, 1, 2], 'tex-forest')
texture('spire-throne', [0], 'tex-obsidian', n=1)
texture('spire-throne', [5], 'tex-stars', n=1)
texture('lumina-village', [3], 'tex-path', n=1)

# --- props from the tilesets (frame 6 scenery, 7 decoration, 8 sparkle)
for zone, i, name in [('lumina-village', 6, 'bush'), ('lumina-village', 7, 'flowers'), ('lumina-village', 8, 'sparkle'),
                      ('silver-shallows', 6, 'palm'), ('verdara', 6, 'pine'), ('verdara', 7, 'mushroom'),
                      ('spire-throne', 7, 'candle'), ('starfall-coast', 6, 'rock')]:
    save_png(frame(PUB / 'tiles' / f'{zone}.png', i), OUT / 'img' / f'prop-{name}.png')
save_png(frame(PUB / 'tiles' / 'props.png', 2), OUT / 'img' / 'prop-chest.png')
save_png(frame(PUB / 'tiles' / 'props.png', 0), OUT / 'img' / 'prop-crystal.png')

# --- favicon and home-screen icon (Ember's egg): cropped to the egg and centred
# at about 80% of the square, in whole-pixel steps so the pixel art stays crisp.
# The 180 px icon is opaque on the theme colour: iOS fills a transparent one
# with black. The game serves the same two files from its root (public/).
egg = frame(PUB / 'sprites' / 'ember-egg' / 'battle.png', 0)
egg = egg.crop(egg.getbbox())


def icon(size, background=None):
    k = max(1, round(size * 0.8 / max(egg.size)))
    big = egg.resize((egg.width * k, egg.height * k), N)
    im = Image.new('RGBA', (size, size), background or (0, 0, 0, 0))
    im.paste(big, ((size - big.width) // 2, (size - big.height) // 2), big)
    return im if background is None else im.convert('RGB')


icon(64).save(OUT / 'img' / 'favicon.png', optimize=True)
icon(180, '#1e1b4b').save(OUT / 'img' / 'apple-touch-icon.png', optimize=True)
for name in ('favicon.png', 'apple-touch-icon.png'):
    shutil.copyfile(OUT / 'img' / name, PUB / name)

# --- the share card

card = Image.open(PUB / 'backgrounds' / 'lumina-village.png').convert('RGBA').resize((256 * 5, 144 * 5), N).crop((40, 45, 1240, 675))
logo = Image.open(OUT / 'img' / 'logo.png')
big = logo.resize((logo.width * 7, logo.height * 7), N)
card.paste(big, ((1200 - big.width) // 2, 40), big)
for sprite, x, y in [('kira', 690, 400), ('ember-dragon', 520, 410)]:
    s = frame(PUB / 'sprites' / sprite / 'world.png', 2).resize((192, 192), N)
    card.paste(s, (x, y), s)
card.convert('RGB').save(OUT / 'img' / 'og.png', optimize=True)

# --- world postcards (real WorldCanvas captures)
for src in sorted((CAP / 'world').glob('place-*.png')):
    save_png(Image.open(src), OUT / 'shots' / src.name, colors=256)

# --- app captures (taken at 2x) for the grown-ups page
APP = CAP / 'app'


def webp(src, dst, width=None, crop=None):
    im = Image.open(APP / src).convert('RGB')
    if crop:
        im = im.crop(crop)
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / 'shots' / f'{dst}.webp', quality=82, method=6)


def card_box(src, pad=36):
    """The white question card: rows and columns that are mostly white."""
    white = np.asarray(Image.open(APP / src).convert('L')) > 246
    rows = np.where(white.sum(1) > 400)[0]
    cols = np.where(white.sum(0) > 400)[0]
    h, w = white.shape
    return (max(0, cols.min() - pad), max(0, rows.min() - pad), min(w, cols.max() + pad), min(h, rows.max() + pad))


if APP.exists():
    webp('topics-desk.png', 'topics', 1280)
    webp('world-desk.png', 'world', 1280)
    webp('battle-commands-desk.png', 'battle-commands', 1280)
    webp('battle-question-desk.png', 'battle-question', 1280)
    webp('quiz-answered-desk.png', 'quiz-report', 900, crop=card_box('quiz-answered-desk.png'))
    webp('battle-question-phone.png', 'phone-battle', 600)
    webp('who-phone.png', 'phone-who', 600)
    webp('pin-phone.png', 'phone-pin', 600)

    # --- the gameplay clip: the turn filmed frame by frame (menu, question, answer, hit)
    clip = APP / 'clip' / 'frames.ffconcat'
    if clip.exists() and shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(clip),
                        '-vf', 'scale=960:-2,fps=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-crf', '26',
                        '-movflags', '+faststart', '-an', str(OUT / 'video' / 'battle-turn.mp4')], check=True)
        first = sorted((APP / 'clip').glob('f*.jpg'))[0]
        poster = Image.open(first).convert('RGB')
        poster.resize((960, round(poster.height * 960 / poster.width)), Image.LANCZOS).save(OUT / 'video' / 'battle-turn.webp', quality=80, method=6)
    else:
        print('no filmed turn or no ffmpeg: the gameplay clip was left as it was')

print('assets ->', OUT)
