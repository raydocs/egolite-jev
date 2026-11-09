#!/usr/bin/env python3
"""1x side-by-side: freeze the faster pane so you watch the slow one keep going."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TTC = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size, bold=False):
    return ImageFont.truetype(TTC, size, index=1 if bold else 0)


def last_json(path: Path) -> dict:
    text = path.read_text(errors="replace")
    m = re.findall(r"\{[^{}]*\"ok\"[^{}]*\}", text, re.S)
    if not m:
        i = text.rfind("{")
        if i < 0:
            return {}
        try:
            return json.loads(text[i:])
        except json.JSONDecodeError:
            return {}
    for blob in reversed(m):
        try:
            return json.loads(blob)
        except json.JSONDecodeError:
            continue
    return {}


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True,
    ).strip()
    return float(out or 0)


def ffmpeg(args: list[str]) -> None:
    subprocess.check_call(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])


def header_png(dest: Path, b_s: float, a_s: float) -> None:
    im = Image.new("RGB", (1920, 140), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((48, 28), "SAME TASK   Open Docs   1x speed", font=font(22), fill=(110, 110, 110))
    d.text((48, 70), "snapshot  /  LLM", font=font(36, True), fill=(17, 17, 17))
    d.text((1040, 70), "ego lite  +  Jev", font=font(36, True), fill=(17, 17, 17))
    d.text((700, 28), f"{b_s:.1f}s", font=font(22, True), fill=(17, 17, 17))
    d.text((1700, 28), f"{a_s:.1f}s", font=font(22, True), fill=(17, 17, 17))
    im.save(dest)


def bar_png(text: str, dest: Path) -> None:
    im = Image.new("RGBA", (960, 56), (255, 255, 255, 230))
    d = ImageDraw.Draw(im)
    d.text((20, 14), text, font=font(22, True), fill=(17, 17, 17, 255))
    im.save(dest)


def main() -> None:
    if len(sys.argv) != 6:
        raise SystemExit("usage: compose-side-by-side.py before.mp4 after.mp4 before.json after.json out.mp4")
    before, after, bj, aj, out = map(Path, sys.argv[1:])
    work = out.parent / "_sbs"
    work.mkdir(parents=True, exist_ok=True)
    br, ar = last_json(bj), last_json(aj)
    b_s = probe_duration(before)
    a_s = probe_duration(after)
    b_ms = float(br.get("elapsed_ms") or b_s * 1000) / 1000.0
    a_ms = float(ar.get("elapsed_ms") or a_s * 1000) / 1000.0
    total = max(b_s, a_s, 1.0)

    header_png(work / "header.png", b_ms, a_ms)
    bar_png("BEFORE  snapshot to LLM", work / "lbar.png")
    bar_png("AFTER  ego lite + Jev", work / "rbar.png")

    # Scale panes, freeze the shorter one until total length.
    b_pad = max(0.0, total - b_s)
    a_pad = max(0.0, total - a_s)
    ffmpeg([
        "-i", str(before),
        "-i", str(after),
        "-i", str(work / "header.png"),
        "-i", str(work / "lbar.png"),
        "-i", str(work / "rbar.png"),
        "-filter_complex",
        (
            f"[0:v]fps=60,scale=960:618:force_original_aspect_ratio=decrease,"
            f"pad=960:618:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration={b_pad:.3f}[L];"
            f"[1:v]fps=60,scale=960:618:force_original_aspect_ratio=decrease,"
            f"pad=960:618:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration={a_pad:.3f}[R];"
            f"[L][3:v]overlay=0:0[L2];"
            f"[R][4:v]overlay=0:0[R2];"
            f"[L2][R2]hstack=inputs=2[mid];"
            f"[2:v]fps=60,format=yuv420p[H];"
            f"[H][mid]vstack=inputs=2,format=yuv420p,fps=60[v]"
        ),
        "-map", "[v]",
        "-t", f"{total:.3f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "60",
        "-movflags", "+faststart",
        str(out),
    ])
    print(f"wrote {out}  before={b_s:.1f}s after={a_s:.1f}s  json {b_ms:.1f}s vs {a_ms:.1f}s")


if __name__ == "__main__":
    main()
