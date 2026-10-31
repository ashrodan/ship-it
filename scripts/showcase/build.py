# Builds the Ship it showcase: PIL frames piped to ffmpeg. 1920x1080, 30 fps, no audio.
#
#   python3 scripts/showcase/build.py <captures folder> <out.mp4>
#
# The captures are `herdr-app shot` frames named as in `scenes` below. Each is
# cropped at x=490 to leave out the sidebar (space names) and the bottom 65px
# (the usage bar). Every scene is also saved as <out>.sceneNN.png to check.
import subprocess, sys
from PIL import Image, ImageDraw, ImageFont
V = sys.argv[1]; OUT = sys.argv[2]
W, H, FPS, FADE = 1920, 1080, 30, 0.4
BG = (17, 18, 22); FG = (236, 237, 240); DIM = (150, 153, 162); ACC = (122, 162, 247)
F = "/System/Library/Fonts/SFNS.ttf"; MONO = "/System/Library/Fonts/SFNSMono.ttf"
def font(n, path=F):
    try: return ImageFont.truetype(path, n)
    except OSError: return ImageFont.truetype(F, n)
CAP_H = 130

def crop(name, box=None):
    im = Image.open(f"{V}/{name}").convert("RGB")
    w, h = im.size
    return im.crop(box or (490, 0, w, h - (65 if h == 1780 else 65)))

def shot(name, caption, sub=None, box=None):
    im = crop(name, box)
    area_w, area_h = W - 80, H - CAP_H - 40
    s = min(area_w / im.width, area_h / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    f = Image.new("RGB", (W, H), BG)
    x, y = (W - im.width) // 2, 30 + (area_h - im.height) // 2
    d = ImageDraw.Draw(f)
    d.rounded_rectangle((x - 2, y - 2, x + im.width + 1, y + im.height + 1), 10, outline=(48, 50, 58), width=2)
    f.paste(im, (x, y))
    d.text((W // 2, H - CAP_H // 2 - (14 if sub else 0)), caption, font=font(40), fill=FG, anchor="mm")
    if sub: d.text((W // 2, H - CAP_H // 2 + 28), sub, font=font(26), fill=DIM, anchor="mm")
    return f

# Parts of the strip, enlarged and stacked, with the caption right under them.
def strip(boxes, caption, sub=None, scale=1.5):
    parts = [Image.open(f"{V}/{n}").convert("RGB").crop(b) for n, b in boxes]
    parts = [im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS) for im in parts]
    gap = 24; total = sum(im.height for im in parts) + gap * (len(parts) - 1)
    f = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(f)
    y = (H - total - 150) // 2
    for im in parts:
        x = (W - im.width) // 2
        d.rounded_rectangle((x - 2, y - 2, x + im.width + 1, y + im.height + 1), 10, outline=(48, 50, 58), width=2)
        f.paste(im, (x, y)); y += im.height + gap
    y += 60
    d.text((W // 2, y), caption, font=font(40), fill=FG, anchor="mm")
    if sub: d.text((W // 2, y + 46), sub, font=font(26), fill=DIM, anchor="mm")
    return f

def card(lines):
    f = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(f)
    total = sum(l[1] + 28 for l in lines); y = (H - total) // 2
    for text, size, color, mono in lines:
        d.text((W // 2, y + size // 2), text, font=font(size, MONO if mono else F), fill=color, anchor="mm"); y += size + 28
    return f

scenes = [
    (card([("Ship it", 120, FG, False), ("From the branch you're on to a merged pull request,", 40, DIM, False), ("without leaving your terminals. A Herdr mod.", 40, DIM, False)]), 3.2),
    (shot("c1-working.png", "Claude and Codex at work on a real PR", "google/adk-go #1630, in a Herdr space"), 3.6),
    (strip([("c1-working.png", (490, 80, 1565, 165)), ("c6-prs.png", (1442, 80, 2580, 165))], "The strip says where the work is", "machine, folder, branch, the PR, its checks and its review"), 3.6),
    (shot("c2-prchanges.png", "PR changes", "everything the branch changes since its base, uncommitted work included"), 3.6),
    (shot("c7-file.png", "Read any file whole", "double-click it to open a read-only pane"), 3.2),
    (shot("c3-overview.png", "The review, in the side panel", "click the PR on the strip: description, conversation, conflicts, comments"), 3.6),
    (shot("c4-files.png", "Files", "the diff, viewed marks, inline threads with Reply and Resolve"), 3.4),
    (shot("c5-checks.png", "Checks", "failing first, the failed log's tail, Re-run failed"), 3.4),
    (shot("c6-prs.png", "Every open PR in the repo", "10 at a time, newest update first: All, Mine, To review, Load more"), 3.6),
    (shot("c8-ship.png", "Ship", "a confirm that says how, into what, and what still looks wrong"), 3.4),
    (strip([("c6-prs.png", (1442, 80, 2580, 165))], "Merged. The branch stays.", scale=1.6), 3.0),
    (card([("Install", 72, FG, False), ("Paste this to your coding agent in a Herdr terminal:", 34, DIM, False),
           ("Read ~/.config/herdr-app/AGENTS.md, then add this mod:", 34, FG, True),
           ("https://github.com/ashrodan/ship-it", 34, ACC, True)]), 4.4),
]

ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)
black = Image.new("RGB", (W, H), BG); prev = black; n = 0
for img, dur in scenes:
    nf = int(dur * FPS); fade = int(FADE * FPS)
    for i in range(nf):
        fr = Image.blend(prev, img, (i + 1) / fade) if i < fade else img
        ff.stdin.write(fr.tobytes()); n += 1
    prev = img
for i in range(int(FADE * FPS)):
    ff.stdin.write(Image.blend(prev, black, (i + 1) / (FADE * FPS)).tobytes()); n += 1
ff.stdin.close(); ff.wait()
print(f"{n} frames, {n / FPS:.1f} s, ffmpeg exit {ff.returncode}")
for k, (img, _) in enumerate(scenes): img.resize((640, 360)).save(f"{OUT}.scene{k:02d}.png")
