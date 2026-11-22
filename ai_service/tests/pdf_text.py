"""
The words in a PDF made by DIG's builder, for tests.

No PDF reader is installed, and the report embeds its fonts, so text sits in
the pages as glyph numbers rather than letters. Each embedded font carries a
ToUnicode table from glyph to letter, which is all it takes to read it back.
Built-in fonts (Helvetica) keep plain Latin-1 strings.
"""

import re
import zlib
from typing import Dict

_OBJ = re.compile(rb"(\d+) 0 obj(.*?)endobj", re.S)
_ESCAPES = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f", b"(": b"(", b")": b")",
            b"\\": b"\\"}


def _stream(body: bytes) -> bytes:
    m = re.search(rb"stream\r?\n(.*?)\r?\nendstream", body, re.S)
    if not m:
        return b""
    data = m.group(1)
    if b"/FlateDecode" in body[:m.start()]:
        try:
            return zlib.decompress(data)
        except zlib.error:
            return b""
    return data


def _utf16(hex_text: bytes) -> str:
    return bytes.fromhex(hex_text.decode()).decode("utf-16-be", "replace")


def _cmap(data: bytes) -> Dict[int, str]:
    table: Dict[int, str] = {}
    for block in re.findall(rb"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            table[int(src, 16)] = _utf16(dst)
    for block in re.findall(rb"beginbfrange(.*?)endbfrange", data, re.S):
        for lo, hi, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            first = ord(_utf16(dst)[-1])
            for k, code in enumerate(range(int(lo, 16), int(hi, 16) + 1)):
                table[code] = chr(first + k)
    return table


def _literal(raw: bytes) -> bytes:
    """A PDF (string) with its escapes undone."""
    out, i = bytearray(), 0
    while i < len(raw):
        ch = raw[i:i + 1]
        if ch != b"\\":
            out += ch
            i += 1
            continue
        nxt = raw[i + 1:i + 2]
        if nxt in _ESCAPES:
            out += _ESCAPES[nxt]
            i += 2
        elif nxt.isdigit():
            digits = re.match(rb"[0-7]{1,3}", raw[i + 1:i + 4]).group(0)
            out.append(int(digits, 8) & 0xFF)
            i += 1 + len(digits)
        else:            # a line continuation, or an unknown escape: dropped
            i += 2
    return bytes(out)


_TOKENS = re.compile(rb"/(F\d+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\)])*)\)\s*Tj|\[(.*?)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj",
                     re.S)
_IN_ARRAY = re.compile(rb"\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f]*)>", re.S)


def pdf_text(pdf: bytes) -> str:
    """Every piece of text on every page, a space between pieces."""
    objects = {int(m.group(1)): m.group(2) for m in _OBJ.finditer(pdf)}
    fonts: Dict[str, Dict] = {}
    for body in objects.values():
        for name, num in re.findall(rb"/(F\d+)\s+(\d+)\s+0\s+R", body):
            font = objects.get(int(num), b"")
            to_unicode = re.search(rb"/ToUnicode\s+(\d+)\s+0\s+R", font)
            fonts[name.decode()] = {"wide": b"/Type0" in font,
                                    "map": _cmap(_stream(objects.get(int(to_unicode.group(1)), b"")))
                                    if to_unicode else {}}

    def decode(raw: bytes, font: Dict) -> str:
        if not font.get("wide"):
            return raw.decode("latin-1")
        table = font["map"]
        return "".join(table.get(int.from_bytes(raw[k:k + 2], "big"), "")
                       for k in range(0, len(raw) - 1, 2))

    pieces = []
    for body in objects.values():
        if b"stream" not in body or b"/Length" not in body:
            continue
        content = _stream(body)
        if b" Tf" not in content:
            continue
        font: Dict = {}
        for m in _TOKENS.finditer(content):
            if m.group(1):
                font = fonts.get(m.group(1).decode(), {})
            elif m.group(2) is not None:
                pieces.append(decode(_literal(m.group(2)), font))
            elif m.group(3) is not None:
                parts = [_literal(a) if a is not None else bytes.fromhex(h.decode())
                         for a, h in _IN_ARRAY.findall(m.group(3))]
                pieces.append("".join(decode(p, font) for p in parts))
            else:
                pieces.append(decode(bytes.fromhex(m.group(4).decode()), font))
    return re.sub(r"\s+", " ", " ".join(pieces))
