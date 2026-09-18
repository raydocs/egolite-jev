#!/usr/bin/env python3
"""Render docs/compare.png — four-way agent-browser comparison."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 980
OUT = Path(__file__).resolve().parent / "compare.png"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size, bold=False):
    path = FONT_B if bold and Path(FONT_B).exists() else FONT
    return ImageFont.truetype(path, size)


def main():
    im = Image.new("RGB", (W, H), (247, 247, 248))
    d = ImageDraw.Draw(im)

    d.text((56, 36), "How an AI agent drives the browser", font=font(36, True), fill=(22, 22, 24))
    d.text(
        (56, 86),
        "Same kind of job: open a site, pick a control, land on a known page.  ego-lite numbers are measured.  Chrome / Playwright are typical agent loops, not hardcoded scripts.",
        font=font(16),
        fill=(90, 90, 95),
    )

    # --- bar chart ---
    bars = [
        ("Chrome  (computer-use / screenshot agent)", 45, False, (180, 80, 70)),
        ("Playwright  (agent writes locators each turn)", 32, False, (200, 140, 60)),
        ("ego-lite  (snapshotText → coding model)", 38, True, (70, 110, 180)),
        ("ego-lite + Jev  (this skill)", 4.1, True, (30, 140, 90)),
    ]
    chart_x, chart_y = 56, 140
    chart_w, row_h = 1488, 52
    max_s = 50.0
    d.text((chart_x, chart_y), "Wall clock, Docs-class task  (seconds, lower is better)", font=font(18, True), fill=(22, 22, 24))
    y = chart_y + 36
    for label, sec, measured, color in bars:
        bar_w = int((sec / max_s) * 980)
        d.rounded_rectangle((chart_x + 420, y, chart_x + 420 + bar_w, y + 36), 6, fill=color)
        d.text((chart_x, y + 8), label, font=font(15), fill=(40, 40, 44))
        tag = f"{sec:g}s" + ("  measured" if measured else "  typical")
        d.text((chart_x + 420 + bar_w + 12, y + 8), tag, font=font(15, True), fill=(22, 22, 24))
        y += row_h

    d.text((chart_x, y + 4), "Chrome / Playwright: typical agent-driven loop (vision or locator-writing), not a pre-written test.  ego-lite + Jev warm cache: 0.92s.", font=font(14), fill=(110, 110, 116))

    # --- matrix ---
    cols = ["Chrome", "Playwright", "ego-lite", "ego-lite + Jev"]
    rows = [
        ("Leaves your daily Chrome alone", "no", "yes", "yes", "yes"),
        ("Can use your logged-in cookies", "yes*", "extra setup", "yes", "yes"),
        ("Dumps page snapshot into the coding model", "yes", "usually", "yes", "no"),
        ("Selector / click invented by a chat model", "yes", "yes", "yes", "no†"),
        ("Docs task, this machine", "—", "—", "35–41s", "4.1s / 0.92s"),
    ]
    mx, my = 56, 460
    col_w = 250
    label_w = 480
    head_h, cell_h = 44, 48
    d.text((mx, my), "Fit for a coding agent", font=font(18, True), fill=(22, 22, 24))
    my += 34

    # good / bad / warn / neutral — keyed by (row index, value)
    good, bad, warn, neu = (
        ((220, 245, 228), (20, 110, 60)),
        ((255, 232, 228), (160, 50, 40)),
        ((255, 244, 220), (140, 100, 20)),
        ((240, 240, 242), (60, 60, 64)),
    )

    def cell_color(row_i, val):
        v = val.lower()
        if row_i == 0:  # leaves daily Chrome alone
            return good if v == "yes" else bad
        if row_i == 1:  # cookies
            if v == "yes":
                return good
            if v == "yes*":
                return bad
            return warn
        if row_i == 2:  # dumps snapshot (yes is bad)
            return good if v == "no" else bad
        if row_i == 3:  # invented by chat (yes is bad)
            return good if v.startswith("no") else bad
        if row_i == 4:
            if "4.1" in v:
                return good
            if "35" in v:
                return warn
            return neu
        return neu

    d.rectangle((mx, my, mx + label_w + col_w * 4, my + head_h), fill=(32, 32, 36))
    d.text((mx + 16, my + 12), "", font=font(15, True), fill=(255, 255, 255))
    for i, c in enumerate(cols):
        d.text((mx + label_w + i * col_w + 16, my + 12), c, font=font(16, True), fill=(255, 255, 255))
    my += head_h
    for r, row in enumerate(rows):
        bg = (255, 255, 255) if r % 2 == 0 else (242, 242, 244)
        d.rectangle((mx, my, mx + label_w + col_w * 4, my + cell_h), fill=bg)
        d.text((mx + 16, my + 14), row[0], font=font(15), fill=(30, 30, 34))
        for i, val in enumerate(row[1:]):
            fill, fg = cell_color(r, val)
            x0 = mx + label_w + i * col_w + 10
            d.rounded_rectangle((x0, my + 8, x0 + col_w - 20, my + 40), 8, fill=fill)
            d.text((x0 + 12, my + 14), val, font=font(15, True), fill=fg)
        my += cell_h

    d.text((56, H - 56), "* attaching to the human Chrome profile.   † Jev picks from opaque keys the runner listed; href match can skip Jev.   Source: README measured table + typical agent loops.", font=font(13), fill=(120, 120, 126))
    im.save(OUT, "PNG")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
