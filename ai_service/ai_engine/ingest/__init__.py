"""Reading uploaded files into tables. See loader."""

from ai_engine.ingest.loader import (
    FORMAT_LABELS,
    SUPPORTED_EXTENSIONS,
    LoadedTable,
    UnsupportedFile,
    detect_format,
    load_table,
)

__all__ = [
    "FORMAT_LABELS",
    "SUPPORTED_EXTENSIONS",
    "LoadedTable",
    "UnsupportedFile",
    "detect_format",
    "load_table",
]
