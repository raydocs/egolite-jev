#!/usr/bin/env python3
"""Label before/after screenshot folders and concat an X-ready mp4."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
BAR = 72
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def load_result(folder: Path) -> dict:
    path = folder / "result.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def letterbox(src: Path, dest: Path, caption: str) -> None:
    im = Image.open(src).convert("RGB")
    scale = min(W / im.width, (H - BAR) / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (W, H), (12, 12, 14))
    canvas.paste(im, ((W - nw) // 2, BAR + (H - BAR - nh) // 2))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, BAR), fill=(12, 12, 14))
    draw.text((28, 18), caption, font=font(28), fill=(255, 255, 255))
    canvas.save(dest, "PNG")


def title_card(text: str, sub: str, dest: Path) -> None:
    canvas = Image.new("RGB", (W, H), (12, 12, 14))
    draw = ImageDraw.Draw(canvas)
    f1, f2 = font(48), font(28)
    b1 = draw.textbbox((0, 0), text, font=f1)
    b2 = draw.textbbox((0, 0), sub, font=f2)
    draw.text(((W - (b1[2] - b1[0])) / 2, 280), text, font=f1, fill=(255, 255, 255))
    draw.text(((W - (b2[2] - b2[0])) / 2, 360), sub, font=f2, fill=(180, 180, 186))
    canvas.save(dest, "PNG")


def pngs(folder: Path) -> list[Path]:
    return sorted(p for p in folder.glob("*.png"))


def stills_to_mp4(stills: list[tuple[Path, float]], dest: Path) -> None:
    lst = dest.with_suffix(".txt")
    lines = []
    for path, dur in stills:
        lines.append("file '%s'" % path.resolve())
        lines.append("duration %.3f" % dur)
    lines.append("file '%s'" % stills[-1][0].resolve())
    lst.write_text("\n".join(lines) + "\n")
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
            "-vf", "fps=30,format=yuv420p",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(dest),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: stitch-x.py <before-dir> <after-dir> <out.mp4>")
    before, after, out = map(Path, sys.argv[1:])
    work = out.parent / "_xframes"
    work.mkdir(parents=True, exist_ok=True)
    br, ar = load_result(before), load_result(after)
    b_ms, a_ms = int(br.get("elapsed_ms") or 0), int(ar.get("elapsed_ms") or 0)
    bd, ad = int(br.get("decide_ms") or 0), int(ar.get("decide_ms") or 0)

    title_card("BEFORE", "ego-lite  snapshotText -> LLM -> click", work / "t0.png")
    title_card("AFTER", "Jev picks the control  ego-browser clicks", work / "t1.png")
    title_card(
        "Decision  %.1fs  ->  %.1fs" % (bd / 1000.0, ad / 1000.0),
        "same goal  Open Docs   same browser  ego lite",
        work / "t2.png",
    )

    labeled = []
    for i, src in enumerate(pngs(before), 1):
        dest = work / ("b-%02d.png" % i)
        letterbox(src, dest, "BEFORE   LLM on snapshot   %.1fs" % (b_ms / 1000.0))
        labeled.append((dest, 1.35))
    for i, src in enumerate(pngs(after), 1):
        dest = work / ("a-%02d.png" % i)
        letterbox(src, dest, "AFTER   Jev   %.1fs wall / %.1fs decide" % (a_ms / 1000.0, ad / 1000.0))
        labeled.append((dest, 1.15))

    stills = [
        (work / "t0.png", 2.0),
        *[(p, d) for p, d in labeled if p.name.startswith("b-")],
        (work / "t1.png", 2.0),
        *[(p, d) for p, d in labeled if p.name.startswith("a-")],
        (work / "t2.png", 3.0),
    ]
    stills_to_mp4(stills, out)
    print("wrote %s  before_wall=%.1fs after_wall=%.1fs decide %.0fms -> %.0fms" % (
        out, b_ms / 1000.0, a_ms / 1000.0, bd, ad))


if __name__ == "__main__":
    main()
