#!/usr/bin/env python3
"""Build the Ship launch video from a recording of the Herdr window.

    python3 scripts/showcase/launch.py CAPTURES out.mp4

CAPTURES holds two takes of `herdr-app shot` frames at about 20 a second and
a times.json: {"take1": [[seconds, "take1-0000.png"], ...], "take2": [...]}.
take1: the strip at rest, the launch (it starts at T1_SHIP), the confetti.
take2: a launch (T2_SHIP) stopped midway (T2_STOP).

Record them with a build whose launch merges nothing; never with a real Ship.
The sidebar and the bottom bar are cropped out (other spaces' names).

PIL draws each frame; raw frames go to ffmpeg (libx264, yuv420p, faststart).
1920x1080, 30 fps, no audio, a crossfade between scenes, a fade to black at
the end. One frame per scene is saved as <out>.sceneN.png.
"""
import bisect, json, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, FADE = 1920, 1080, 30, 0.35
BG, FG, DIM, ACC, EDGE = (17, 18, 22), (236, 237, 240), (150, 153, 162), (122, 162, 247), (48, 50, 58)
SANS, MONO = "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/SFNSMono.ttf"
# In a 3024x1780 capture: the window without the sidebar and the bottom bar, and the strip.
WINDOW, STRIP = (624, 0, 3024, 1716), (624, 90, 3024, 180)
T1_SHIP, T1_LAND, T2_SHIP, T2_STOP = 1.5, 5.2, 1.0, 3.3

captures, out = sys.argv[1], sys.argv[2]
times = json.load(open(f"{captures}/times.json"))


def font(size, mono=False):
    for path in ([MONO] if mono else []) + [SANS, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def caption(d, text, sub):
    d.text((W // 2, H - 79 if sub else H - 65), text, font=font(40), fill=FG, anchor="mm")
    if sub:
        d.text((W // 2, H - 33), sub, font=font(26), fill=DIM, anchor="mm")


def framed(f, im, x, y):
    ImageDraw.Draw(f).rounded_rectangle((x - 2, y - 2, x + im.width + 1, y + im.height + 1), 8, outline=EDGE, width=2)
    f.paste(im, (x, y))


def fit(im, w, h):
    s = min(w / im.width, h / im.height)
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)


cache = {}


# The capture a take showed at `t`, laid out: the strip enlarged over the
# window (zoom), or the window alone.
def capture(take, t, zoom):
    rows = times[take]
    name = rows[max(0, bisect.bisect_right([r[0] for r in rows], t) - 1)][1]
    if (name, zoom) not in cache:
        if len(cache) > 8:
            cache.clear()
        im = Image.open(f"{captures}/{name}").convert("RGB")
        f = Image.new("RGB", (W, H), BG)
        if zoom:
            strip = fit(im.crop(STRIP), W - 80, 200)
            framed(f, strip, (W - strip.width) // 2, 34)
            win = fit(im.crop(WINDOW), W - 80, H - 130 - 34 - strip.height - 40)
            framed(f, win, (W - win.width) // 2, 34 + strip.height + 28)
        else:
            win = fit(im.crop(WINDOW), W - 80, H - 130 - 50)
            framed(f, win, (W - win.width) // 2, 30)
        cache[(name, zoom)] = f
    return cache[(name, zoom)]


def take(name, start, end, text, sub=None, zoom=True, hold=0.0):
    def draw(t):
        f = capture(name, start + max(0.0, t - hold), zoom).copy()
        caption(ImageDraw.Draw(f), text, sub)
        return f
    return (end - start + hold, draw)


def card(lines, seconds):
    f = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(f)
    gap = 26
    total = sum(size for _, size, *_ in lines) + gap * (len(lines) - 1)
    y = (H - total) // 2
    for text, size, *rest in lines:
        color = {"dim": DIM, "accent": ACC}.get(rest[0] if rest else "", FG)
        d.text((W // 2, y + size // 2), text, font=font(size, "mono" in rest), fill=color, anchor="mm")
        y += size + gap
    return (seconds, lambda t: f)


scenes = [
    card([("Ship your PRs", 104), ("without leaving Herdr", 104), ("", 10), ("Ship it · a Herdr mod", 38, "dim")], 3.2),
    take("take1", 0.2, T1_SHIP, "An open pull request, ready to merge", "its checks, its review and Ship, on a strip over your terminals", hold=1.6),
    take("take1", T1_SHIP, T1_LAND, "Click Ship: a 3-second launch", "no dialog: the strip says how it merges, and into what"),
    take("take1", T1_LAND, T1_LAND + 3.2, "The merge lands. Confetti.", zoom=False),
    take("take2", T2_SHIP - 0.3, T2_STOP + 1.7, "Changed your mind? Click the strip", "the launch stops, and nothing merges"),
    card([("Install", 72), ("Paste this to your coding agent in a Herdr terminal:", 34, "dim"), ("Read ~/.config/herdr-app/AGENTS.md, then add this mod:", 34, "fg", "mono"),
          ("https://github.com/ashrodan/ship-it", 34, "accent", "mono")], 4.2),
]

ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
black = Image.new("RGB", (W, H), (0, 0, 0))
for n, (seconds, draw) in enumerate(scenes):
    last = n == len(scenes) - 1
    draw(seconds / 2).save(f"{out}.scene{n + 1}.png")
    # A scene ends FADE early; the next one's first FADE seconds blend in over its last frames.
    for i in range(round((seconds - (0 if last else FADE)) * FPS)):
        t = i / FPS
        f = draw(t)
        if n and t < FADE:
            before, earlier = scenes[n - 1]
            f = Image.blend(earlier(before - FADE + t), f, t / FADE)
        if last and seconds - t < 0.6:
            f = Image.blend(black, f, max(0.0, (seconds - t) / 0.6))
        ff.stdin.write(f.tobytes())
ff.stdin.close()
sys.exit(ff.wait())
