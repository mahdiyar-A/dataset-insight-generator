"""
Fonts and text direction for report text that is not in a Latin script.

Shared by the PDF builder and the chart generator. DejaVu Sans comes with
matplotlib and covers Latin, Greek, Cyrillic, Hebrew, Arabic and Persian; a
CJK font is looked for on the system for Chinese, Japanese and Korean (the
Docker image installs fonts-droid-fallback).
"""

import os
import re
from typing import Optional

CJK_FONT_FILES = (
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",   # fonts-droid-fallback (Docker image)
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    r"C:\Windows\Fonts\msyh.ttc",                                  # local development on Windows
)

# Hebrew, Arabic and the scripts between them, plus Arabic presentation forms.
RTL_CHARS = re.compile("[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]")
_LETTER = re.compile(r"[^\W\d_]")


def cjk_font_file() -> Optional[str]:
    return next((path for path in CJK_FONT_FILES if os.path.exists(path)), None)


def dejavu_dir() -> Optional[str]:
    """matplotlib's own copy of DejaVu Sans, which every install has."""
    try:
        import matplotlib
        path = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
        return path if os.path.exists(os.path.join(path, "DejaVuSans.ttf")) else None
    except Exception:
        return None


def has_rtl(*texts) -> bool:
    return any(RTL_CHARS.search(str(t)) for t in texts if t)


def starts_rtl(text) -> bool:
    """Whether a paragraph reads right to left: its first letter decides."""
    m = _LETTER.search(str(text or ""))
    return bool(m and RTL_CHARS.match(m.group()))
