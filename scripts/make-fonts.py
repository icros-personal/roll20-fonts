"""Generate the test fonts used by the diagnostic page.

Requires: pip install fonttools brotli
Run from the repo root: python scripts/make-fonts.py

Outputs:
  src/fonts/probe.{ttf,woff,woff2}   tiny self-made font (A=square, B=diamond, C=triangle, D=ring)
  src/fonts/roll20-d6.woff           the Roll20 font bytes exactly as embedded in styles.css
  src/fonts/roll20-d6.ttf            same, decompressed to plain TrueType
  src/fonts/roll20-d6-names.woff     same glyphs, mangled name table replaced with clean names
  src/fonts/roll20-d6-clean.woff     clean names + all TrueType hinting stripped
  src/generated-fonts.css            @font-face rules (external + base64 data-URI variants)
"""

import base64
import io
import pathlib
import re

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

UPM = 1000
# Deliberately wide advance so a width measurement can tell it apart from any fallback font.
ADVANCE = 1700


def poly(pen, points):
    pen.moveTo(points[0])
    for p in points[1:]:
        pen.lineTo(p)
    pen.closePath()


def glyph(draw):
    pen = TTGlyphPen(None)
    draw(pen)
    return pen.glyph()


def build_probe():
    shapes = {
        ".notdef": lambda p: poly(p, [(100, 0), (100, 700), (600, 700), (600, 0)]),
        "space": lambda p: None,
        # Clockwise outer contours (TrueType convention).
        "A": lambda p: poly(p, [(150, 0), (150, 700), (850, 700), (850, 0)]),
        "B": lambda p: poly(p, [(500, -50), (100, 350), (500, 750), (900, 350)]),
        "C": lambda p: poly(p, [(100, 0), (500, 750), (900, 0)]),
        "D": lambda p: (
            poly(p, [(150, 0), (150, 700), (850, 700), (850, 0)]),
            poly(p, [(300, 150), (700, 150), (700, 550), (300, 550)]),  # hole
        ),
    }
    order = list(shapes)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({32: "space", 65: "A", 66: "B", 67: "C", 68: "D"})
    fb.setupGlyf({name: glyph(draw) for name, draw in shapes.items()})
    fb.setupHorizontalMetrics({name: (ADVANCE, 0) for name in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "DiceProbe", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    return fb.font


def save(font, name, flavor=None):
    font.flavor = flavor
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    (OUT / name).write_bytes(data)
    print(f"{name}: {len(data)} bytes")
    return data


def fix_names(font):
    name = font["name"]
    name.names = []
    for nid, s in {
        1: "Roll20 D6 Test",
        2: "Regular",
        3: "Roll20 D6 Test Regular",
        4: "Roll20 D6 Test Regular",
        6: "Roll20D6Test-Regular",
    }.items():
        name.setName(s, nid, 3, 1, 0x409)
        name.setName(s, nid, 1, 0, 0)


def strip_hinting(font):
    for tag in ("fpgm", "prep", "cvt ", "hdmx", "VDMX", "LTSH", "gasp"):
        if tag in font:
            del font[tag]
    glyf = font["glyf"]
    for g in glyf.glyphs:
        gl = glyf[g]
        if hasattr(gl, "program"):
            gl.program = ttProgram.Program()
            gl.program.fromBytecode(b"")
    font["maxp"].maxFunctionDefs = 0
    font["maxp"].maxInstructionDefs = 0
    font["maxp"].maxStackElements = 0
    font["maxp"].maxSizeOfInstructions = 0


def main():
    probe = build_probe()
    save(probe, "probe.ttf")
    probe_woff = save(probe, "probe.woff", "woff")
    save(probe, "probe.woff2", "woff2")

    css = (ROOT / "src" / "styles.css").read_text()
    roll20 = base64.b64decode(re.search(r"base64,([A-Za-z0-9+/=]+)", css).group(1))
    (OUT / "roll20-d6.woff").write_bytes(roll20)
    print(f"roll20-d6.woff: {len(roll20)} bytes")

    save(TTFont(io.BytesIO(roll20)), "roll20-d6.ttf")
    f = TTFont(io.BytesIO(roll20))
    fix_names(f)
    names_woff = save(f, "roll20-d6-names.woff", "woff")
    f = TTFont(io.BytesIO(roll20))
    fix_names(f)
    strip_hinting(f)
    save(f, "roll20-d6-clean.woff", "woff")

    def b64(data):
        return base64.b64encode(data).decode()

    faces = [
        ("probe-ttf", 'url("./fonts/probe.ttf") format("truetype")'),
        ("probe-woff", 'url("./fonts/probe.woff") format("woff")'),
        ("probe-woff2", 'url("./fonts/probe.woff2") format("woff2")'),
        ("probe-woff-b64", f'url(data:font/woff;base64,{b64(probe_woff)}) format("woff")'),
        ("roll20-ext-woff", 'url("./fonts/roll20-d6.woff") format("woff")'),
        ("roll20-ext-ttf", 'url("./fonts/roll20-d6.ttf") format("truetype")'),
        ("roll20-names-woff", 'url("./fonts/roll20-d6-names.woff") format("woff")'),
        ("roll20-names-b64", f'url(data:font/woff;base64,{b64(names_woff)}) format("woff")'),
        ("roll20-clean-woff", 'url("./fonts/roll20-d6-clean.woff") format("woff")'),
    ]
    out = ["/* Generated by scripts/make-fonts.py - do not edit. */"]
    for family, src in faces:
        out.append(f'@font-face {{\n  font-family: "{family}";\n  src: {src};\n}}')
    (ROOT / "src" / "generated-fonts.css").write_text("\n\n".join(out) + "\n")
    print("generated-fonts.css written")


if __name__ == "__main__":
    main()
