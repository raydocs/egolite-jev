#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(n: int):
    return ImageFont.truetype(FONT, n)


def last_json(path: Path) -> dict:
    text = path.read_text(errors="replace")
    matches = list(re.finditer(r"\{[\s\S]*\}\s*$", text.strip()))
    if not matches:
        # take last balanced-ish blob
        i = text.rfind("\n{")
        if i >= 0:
            return json.loads(text[i + 1 :])
        return {}
    return json.loads(matches[-1].group(0))


def title_png(title: str, sub: str, dest: Path) -> None:
    im = Image.new("RGB", (W, H), (12, 12, 14))
    d = ImageDraw.Draw(im)
    f1, f2 = font(64), font(32)
    b1 = d.textbbox((0, 0), title, font=f1)
    b2 = d.textbbox((0, 0), sub, font=f2)
    d.text(((W - (b1[2] - b1[0])) / 2, 430), title, font=f1, fill=(255, 255, 255))
    d.text(((W - (b2[2] - b2[0])) / 2, 530), sub, font=f2, fill=(180, 180, 186))
    im.save(dest)


def bar_png(text: str, dest: Path) -> None:
    im = Image.new("RGBA", (W, 88), (12, 12, 14, 230))
    d = ImageDraw.Draw(im)
    d.text((36, 24), text, font=font(32), fill=(255, 255, 255, 255))
    im.save(dest)


def ffmpeg(args: list[str]) -> None:
    subprocess.check_call(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])


def still_clip(png: Path, seconds: float, dest: Path) -> None:
    ffmpeg([
        "-loop", "1", "-framerate", "60", "-t", f"{seconds:.2f}", "-i", str(png),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "60", str(dest),
    ])


def overlay_bar(src: Path, bar: Path, dest: Path) -> None:
    ffmpeg([
        "-i", str(src), "-i", str(bar),
        "-filter_complex", "overlay=0:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "60", str(dest),
    ])


def concat(clips: list[Path], dest: Path) -> None:
    lst = dest.with_suffix(".txt")
    lst.write_text("".join("file '%s'\n" % p.resolve() for p in clips))
    ffmpeg(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(dest)])


def main() -> None:
    if len(sys.argv) != 6:
        raise SystemExit("usage: stitch-live60.py before.mp4 after.mp4 before.json after.json out.mp4")
    before_v, after_v, before_j, after_j, out = map(Path, sys.argv[1:])
    br, ar = last_json(before_j), last_json(after_j)
    work = out.parent / "_live60"
    work.mkdir(parents=True, exist_ok=True)

    b_ms = int(br.get("elapsed_ms") or 0)
    a_ms = int(ar.get("elapsed_ms") or 0)
    bd = int(br.get("decide_ms") or br.get("timing", {}).get("jev_ms") or 0)
    ad = int(ar.get("timing", {}).get("jev_ms") or ar.get("decide_ms") or 0)
    via = ""
    steps = ar.get("steps") or []
    if steps:
        via = str(steps[0].get("via") or "")

    t0, t1, t2 = work / "t0.png", work / "t1.png", work / "t2.png"
    title_png("BEFORE", "snapshotText into an LLM, then click", t0)
    title_png("AFTER", "Jev / href  same goal, same ego lite", t1)
    title_png(
        "%.1fs  ->  %.1fs" % (b_ms / 1000.0, a_ms / 1000.0),
        "Find ego lite on GitHub   60 fps",
        t2,
    )
    c0, c1, c2 = work / "t0.mp4", work / "t1.mp4", work / "t2.mp4"
    still_clip(t0, 2.0, c0)
    still_clip(t1, 2.0, c1)
    still_clip(t2, 3.0, c2)

    bar_png("BEFORE  LLM on snapshot   %.1fs" % (b_ms / 1000.0), work / "bar-b.png")
    after_label = "AFTER  %s   %.1fs" % ((via or "Jev"), a_ms / 1000.0)
    bar_png(after_label, work / "bar-a.png")
    overlay_bar(before_v, work / "bar-b.png", work / "before.mp4")
    overlay_bar(after_v, work / "bar-a.png", work / "after.mp4")
    concat([c0, work / "before.mp4", c1, work / "after.mp4", c2], out)
    print("wrote", out, "before=%.1fs after=%.1fs decide %sms -> %sms" % (
        b_ms / 1000.0, a_ms / 1000.0, bd, ad))


if __name__ == "__main__":
    main()
