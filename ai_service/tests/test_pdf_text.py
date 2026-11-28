"""
The tests' own PDF reader. CI failed on 28 Nov 2026 because it cut a stream at
the first line break before "endstream": a compressed stream whose last byte
was a carriage return lost that byte and would not decompress.
"""

import zlib

from tests.pdf_text import streams


def _ending_in_cr() -> bytes:
    for n in range(100_000):
        data = f"0.0784 0.1020 0.1686 rg page {n}".encode()
        packed = zlib.compress(data)
        if packed.endswith(b"\r"):
            return data
    raise AssertionError("no payload found")


def _pdf(*bodies: bytes) -> bytes:
    out = b"%PDF-1.7\n"
    for i, data in enumerate(bodies, start=1):
        packed = zlib.compress(data)
        out += (f"{i} 0 obj\n<</Filter /FlateDecode /Length {len(packed)}>>\nstream\n".encode()
                + packed + b"\nendstream\nendobj\n")
    return out + b"%%EOF\n"


def test_a_stream_whose_bytes_end_in_a_carriage_return_is_read_whole():
    tricky = _ending_in_cr()
    assert list(streams(_pdf(b"BT (first) Tj ET", tricky))) == [b"BT (first) Tj ET", tricky]


def test_a_stream_holding_the_word_endstream_is_read_whole():
    data = b"(\nendstream) Tj"
    assert list(streams(_pdf(data))) == [data]


def test_an_indirect_length_is_skipped_not_misread():
    pdf = b"1 0 obj\n<</Length 123 0 R>>\nstream\nabc\nendstream\nendobj\n"
    assert list(streams(pdf)) == []
