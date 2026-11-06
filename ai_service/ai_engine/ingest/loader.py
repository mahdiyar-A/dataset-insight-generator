"""
Reading an uploaded file into a table, whatever format it arrived in.

Until now an upload had to be CSV or Excel, and the CSV path guessed its way
through encodings and delimiters with no record of what it chose. This module
reads the formats people actually export data in, decides by content rather
than by file name, and reports what it did:

  Text        CSV, TSV, semicolon- or pipe-separated, whitespace-aligned .txt/.dat
  Spreadsheet Excel (.xlsx, .xlsm, legacy .xls), OpenDocument (.ods), and the
              "Excel" files legacy systems export that are really HTML tables
  Data        JSON (records, columns, {"data": [...]}, GeoJSON), JSON Lines, XML
  Columnar    Parquet, Feather / Arrow IPC, ORC
  Statistics  Stata (.dta), SAS (.sas7bdat, .xpt), SPSS (.sav, .zsav)
  Database    SQLite (the largest table)
  Compressed  .gz, .bz2, .xz, and a .zip holding a data file

The file name is a hint, never trusted: a ".xls" that is really CSV, or a
".csv" that is really a spreadsheet, is read as what it is.

Security, because these bytes come from anyone:

  * Nothing that can execute code is read: no pickle, no HDF5, and Excel
    macros are never run (openpyxl does not execute them).
  * XML is parsed with entity resolution, DTD loading and network access off,
    which closes the XXE and "billion laughs" attacks.
  * Compressed input is decompressed in bounded chunks and refused past
    MAX_DECOMPRESSED_BYTES, so a 50 KB zip bomb cannot expand to 10 GB.
  * SQLite is opened read-only with trusted_schema off, and only tables —
    never views — are read.

After reading, every format is normalised the same way: column names made
unique and non-empty, entirely empty columns and rows dropped, surrounding
whitespace trimmed from text, timezones removed from timestamps, nested JSON
values turned into text, and numbers written as text ("$1,234", "45%") read as
numbers. Each step that changed something is recorded in `notes`, so the user
can be told what was done.
"""

from __future__ import annotations

import bz2
import csv
import gzip
import io
import json
import lzma
import os
import re
import sqlite3
import tempfile
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ai_engine.core.coerce import coerce_types

MAX_DECOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_ROWS = 2_000_000
MAX_COLUMNS = 1_000
MAX_SQLITE_TABLES = 200
MAX_XML_ELEMENTS = 5_000_000

# Extensions a user can upload. The backend (FileFormats.cs) and the upload
# form (lib/uploadFormats.js) keep their own copies of this list; keep all three in
# step.
SUPPORTED_EXTENSIONS = (
    ".csv", ".tsv", ".tab", ".txt", ".dat", ".psv",
    ".xlsx", ".xlsm", ".xls", ".ods",
    ".json", ".jsonl", ".ndjson", ".geojson", ".xml",
    ".parquet", ".pq", ".feather", ".arrow", ".ipc", ".orc",
    ".dta", ".sas7bdat", ".xpt", ".sav", ".zsav",
    ".sqlite", ".sqlite3", ".db",
    ".gz", ".bz2", ".xz", ".zip",
)

FORMAT_LABELS = {
    "text": "CSV / text", "xlsx": "Excel", "xls": "Excel 97-2003", "ods": "OpenDocument spreadsheet",
    "html": "HTML table", "json": "JSON", "jsonl": "JSON Lines", "xml": "XML",
    "parquet": "Parquet", "feather": "Feather / Arrow", "orc": "ORC",
    "dta": "Stata", "sas7bdat": "SAS", "xpt": "SAS transport", "sav": "SPSS",
    "sqlite": "SQLite database",
}


class UnsupportedFile(ValueError):
    """The bytes are not a table this module can read. The message is shown to users."""


@dataclass
class LoadedTable:
    df: pd.DataFrame
    format: str                                              # key of FORMAT_LABELS
    detail: Dict[str, Any] = field(default_factory=dict)     # sheet, delimiter, encoding...
    notes: List[str] = field(default_factory=list)           # what normalisation changed
    conversions: List[Dict[str, Any]] = field(default_factory=list)  # text read as numbers

    def summary(self, preview_rows: int = 5) -> Dict[str, Any]:
        """What the upload form shows: shape, headers and the first rows, as text."""
        head = self.df.head(preview_rows)
        preview = [[_cell_text(v) for v in row] for row in head.itertuples(index=False, name=None)]
        return {
            "format": self.format,
            "formatLabel": FORMAT_LABELS.get(self.format, self.format),
            "rows": int(len(self.df)),
            "columns": int(len(self.df.columns)),
            "headers": [str(c) for c in self.df.columns],
            "preview": preview,
            "detail": self.detail,
            "notes": self.notes,
        }


def _cell_text(v: Any) -> str:
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)[:200]


# ─────────────────────────────────────────────────────────────────────────────
# Format detection
# ─────────────────────────────────────────────────────────────────────────────

def _ext(name: str) -> str:
    return os.path.splitext((name or "").lower())[1]


def detect_format(data: bytes, file_name: str = "") -> str:
    """What the bytes are, from their content first and the name second."""
    head = data[:8192]
    ext = _ext(file_name)

    if head.startswith(b"\x1f\x8b"):
        return "gzip"
    if head.startswith(b"BZh"):
        return "bz2"
    if head.startswith(b"\xfd7zXZ\x00"):
        return "xz"
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06"):
        return _zip_kind(data)
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "xls"
    if head.startswith(b"PAR1"):
        return "parquet"
    if head.startswith(b"ARROW1") or head.startswith(b"FEA1"):
        return "feather"
    if head.startswith(b"ORC"):
        return "orc"
    if head.startswith(b"SQLite format 3\x00"):
        return "sqlite"
    if head.startswith(b"$FL2") or head.startswith(b"$FL3"):
        return "sav"
    if head.startswith(b"<stata_dta>"):
        return "dta"
    if head.startswith(b"HEADER RECORD*******LIB"):
        return "xpt"   # LIBRARY (version 5) or LIBV8 (version 8)
    if head.startswith(b"%PDF"):
        return "pdf"
    if ext == ".sas7bdat":
        return "sas7bdat"
    if ext == ".dta":
        return "dta"   # Stata 8-12 files carry no text signature
    if ext == ".xpt" and b"HEADER RECORD" in head[:200]:
        return "xpt"

    text_head = _decode_sample(head)
    stripped = text_head.lstrip("﻿ \t\r\n")
    lowered = stripped[:300].lower()
    if lowered.startswith("<!doctype html") or lowered.startswith("<html") or lowered.startswith("<table"):
        return "html"
    if stripped.startswith("<"):
        return "xml"
    if stripped.startswith("{") or stripped.startswith("["):
        if ext in (".jsonl", ".ndjson") or _looks_like_jsonl(text_head):
            return "jsonl"
        return "json"
    if "\x00" in text_head[:2000]:
        return "binary"
    return "text"


def _zip_kind(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = set(z.namelist())
            if "xl/workbook.xml" in names:
                return "xlsx"
            if "mimetype" in names:
                mt = z.read("mimetype")[:100]
                if b"opendocument.spreadsheet" in mt:
                    return "ods"
                return "office_document"
            if "word/document.xml" in names or "ppt/presentation.xml" in names:
                return "office_document"
    except zipfile.BadZipFile:
        raise UnsupportedFile("The file looks like a ZIP archive but is damaged.")
    return "zip"


def _decode_sample(raw: bytes) -> str:
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def _looks_like_jsonl(text: str) -> bool:
    lines = [l.strip() for l in text.splitlines() if l.strip()][:6]
    if len(lines) < 2:
        return False
    try:
        # The last sampled line may be cut off by the sample boundary.
        return all(isinstance(json.loads(l), dict) for l in lines[:-1])
    except ValueError:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Decompression (bounded)
# ─────────────────────────────────────────────────────────────────────────────

def _too_big() -> UnsupportedFile:
    return UnsupportedFile(
        f"The file expands to more than {MAX_DECOMPRESSED_BYTES // (1024 * 1024)} MB "
        "when decompressed, which is more than DIG can analyse.")


def _bounded_read(stream) -> bytes:
    out = io.BytesIO()
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        out.write(chunk)
        if out.tell() > MAX_DECOMPRESSED_BYTES:
            raise _too_big()
    return out.getvalue()


def _strip_ext(name: str, ext: str) -> str:
    return name[: -len(ext)] if name.lower().endswith(ext) else name


def _unzip(data: bytes) -> Tuple[bytes, str]:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries = [i for i in z.infolist()
                   if not i.is_dir() and not i.filename.startswith("__MACOSX/")
                   and not os.path.basename(i.filename).startswith(".")]
        if any(i.flag_bits & 0x1 for i in entries):
            raise UnsupportedFile("The ZIP file is password-protected. Upload it without a password.")
        data_entries = [i for i in entries
                        if _ext(i.filename) in SUPPORTED_EXTENSIONS and _ext(i.filename) != ".zip"]
        if not data_entries:
            raise UnsupportedFile("The ZIP file has no data file inside that DIG can read.")
        # The largest data file is the one meant; a readme or a small lookup
        # table often travels with it.
        entry = max(data_entries, key=lambda i: i.file_size)
        if entry.file_size > MAX_DECOMPRESSED_BYTES:
            raise _too_big()
        with z.open(entry) as f:
            return _bounded_read(f), os.path.basename(entry.filename)


# ─────────────────────────────────────────────────────────────────────────────
# Text
# ─────────────────────────────────────────────────────────────────────────────

_TEXT_ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")
_DELIMITERS = [",", ";", "\t", "|"]


def _decode_text(data: bytes) -> Tuple[str, str]:
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        return data.decode("utf-16"), "utf-16"
    for enc in _TEXT_ENCODINGS:
        try:
            return data.decode(enc), ("utf-8" if enc == "utf-8-sig" else enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="replace"), "latin-1"


def _field_counts(lines: List[str], delimiter: str) -> List[int]:
    return [len(row) for row in csv.reader(lines, delimiter=delimiter)]


def _sniff_delimiter(sample: str) -> Optional[str]:
    """
    The delimiter that splits most lines into the same number of fields.

    csv.Sniffer alone is unreliable here: it happily picks "," for a
    semicolon file whose decimals are written "3,5". So each candidate is
    scored on consistency across lines, and Sniffer only breaks a tie.
    """
    lines = [l for l in sample.splitlines() if l.strip()][:60]
    if len(lines) > 1:
        lines = lines[:-1]  # the last sampled line may be cut off
    if not lines:
        return None
    scores = {}
    for d in _DELIMITERS:
        counts = _field_counts(lines, d)
        modal, freq = Counter(counts).most_common(1)[0]
        if modal < 2:
            continue
        scores[d] = (freq / len(counts), min(modal, 50))
    if not scores:
        return None
    best = max(scores.values())
    tied = [d for d, s in scores.items() if s == best]
    if len(tied) == 1:
        return tied[0]
    try:
        sniffed = csv.Sniffer().sniff("\n".join(lines[:20]), delimiters="".join(tied)).delimiter
        if sniffed in tied:
            return sniffed
    except csv.Error:
        pass
    return tied[0]


def _header_row(rows: List[List[Any]]) -> int:
    """
    Index of the header row, skipping title lines above a table.

    Exports often start with "Sales report — generated 3 Nov" and a blank
    line before the real header. The header is the first row that spans the
    table's full width.
    """
    if not rows:
        return 0
    widths = [sum(1 for c in r if str(c).strip() not in ("", "nan", "None")) for r in rows]
    full = max(widths)
    if full < 2:
        return 0
    # Half the width, not all of it: a header often has a blank name or two
    # (the index column pandas writes is unnamed), while a title line fills
    # one or two cells.
    for i, w in enumerate(widths[:30]):
        if w >= max(2, full * 0.5):
            return i
    return 0


def _read_text(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    text, encoding = _decode_text(data)
    detail["encoding"] = encoding
    sample = text[:131072]
    sep = _sniff_delimiter(sample)
    if sep is None:
        lines = [l for l in sample.splitlines() if l.strip()][:30]
        widths = [len(l.split()) for l in lines]
        if widths and Counter(widths).most_common(1)[0][0] >= 2:
            # Columns aligned with spaces, as in a .txt or .dat report.
            detail["delimiter"] = "whitespace"
            rows = [l.split() for l in lines]
            skip = _header_row(rows)
            if skip:
                detail["skippedTitleRows"] = skip
            return pd.read_csv(io.StringIO(text), sep=r"\s+", engine="python", skiprows=skip,
                               on_bad_lines="skip")
        # A single column. Read it so the quality check can say plainly that
        # analysis needs at least two.
        detail["delimiter"] = "none"
        return pd.read_csv(io.StringIO(text), sep=",", engine="python", on_bad_lines="skip")

    detail["delimiter"] = {"\t": "tab"}.get(sep, sep)
    sample_rows = list(csv.reader(io.StringIO(sample), delimiter=sep))
    skip = _header_row(sample_rows[:30])
    if skip:
        detail["skippedTitleRows"] = skip
    return pd.read_csv(io.StringIO(text), sep=sep, skiprows=skip, on_bad_lines="skip",
                       engine="c", low_memory=False, dtype=_code_columns(sample_rows[:2000], skip) or None)


_CODE = re.compile(r"^[-+]?0\d")


def _code_columns(rows: List[List[str]], header: int) -> Dict[str, Any]:
    """
    Columns of codes written with leading zeros (ZIP codes, account numbers,
    "007"), to be read as text. read_csv turns "00501" into 501 before any
    later step can see the zeros. The 10% share matches the rule coerce_types
    applies to columns that arrive as text.
    """
    if len(rows) <= header + 1:
        return {}
    names, body = rows[header], rows[header + 1:]
    codes: Dict[str, Any] = {}
    for i, name in enumerate(names):
        if not name.strip() or names.count(name) > 1:
            continue
        values = [r[i].strip() for r in body if i < len(r) and r[i].strip()]
        hits = sum(1 for v in values if _CODE.match(v))
        if values and hits >= max(1, 0.1 * len(values)):
            codes[name] = str
    return codes


# ─────────────────────────────────────────────────────────────────────────────
# Spreadsheets and HTML
# ─────────────────────────────────────────────────────────────────────────────

def _frame_from_grid(raw: pd.DataFrame) -> pd.DataFrame:
    """A header-less grid (header=None read) into a frame with its real header."""
    raw = raw.dropna(how="all").dropna(axis=1, how="all")
    if raw.empty:
        return raw
    rows = raw.head(30).astype(object).where(raw.head(30).notna(), "").values.tolist()
    h = _header_row(rows)
    header = [str(v).strip() if not (isinstance(v, float) and np.isnan(v)) else "" for v in raw.iloc[h].tolist()]
    body = raw.iloc[h + 1:].copy()
    body.columns = header
    return body.reset_index(drop=True).infer_objects()


def _left_out_note(detail: Dict[str, Any]) -> Optional[str]:
    """
    Names the sheets or tables that were not read.

    One sheet of five was analysed and nothing told the person, so a report on
    "Company Bank" read as a report on the whole workbook.
    """
    others = detail.get("otherSheets") or detail.get("otherTables") or []
    if not others:
        return None
    kind, read = ("sheet", detail["sheet"]) if detail.get("sheet") else ("table", detail.get("table"))
    names = ", ".join(others[:5]) + ("…" if len(others) > 5 else "")
    return (f'Read only the {kind} "{read}", which holds the most data. Not read: {names}. '
            f"To analyse one of those, upload it as its own file.")


def _read_excel(data: bytes, fmt: str, detail: Dict[str, Any]) -> pd.DataFrame:
    engine = {"xlsx": "openpyxl", "xls": "xlrd", "ods": "odf"}[fmt]
    try:
        sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, header=None, engine=engine)
    except ImportError:
        raise UnsupportedFile(f"{FORMAT_LABELS[fmt]} files cannot be read on this server yet.")
    except Exception as exc:
        raise UnsupportedFile(f"The spreadsheet could not be opened ({type(exc).__name__}). "
                              "If it is password-protected, save an unprotected copy.")
    if not sheets:
        raise UnsupportedFile("The spreadsheet has no sheets.")
    # The sheet with the most filled cells is the data; the others are
    # usually notes, pivots or lookups.
    filled = {name: int(raw.notna().to_numpy().sum()) for name, raw in sheets.items()}
    best = max(filled, key=filled.get)
    if filled[best] == 0:
        raise UnsupportedFile("The spreadsheet is empty.")
    detail["sheet"] = str(best)
    others = [str(n) for n in sheets if n != best and filled[n] > 0]
    if others:
        detail["otherSheets"] = others[:20]
    df = _frame_from_grid(sheets[best])
    skipped = sheets[best].dropna(how="all").shape[0] - len(df) - 1
    if skipped > 0:
        detail["skippedTitleRows"] = int(skipped)
    return df


def _read_html(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    text, encoding = _decode_text(data)
    detail["encoding"] = encoding
    try:
        tables = pd.read_html(io.StringIO(text), flavor="lxml")
    except (ValueError, ImportError):
        raise UnsupportedFile("No table was found in this HTML file.")
    if not tables:
        raise UnsupportedFile("No table was found in this HTML file.")
    best = max(tables, key=lambda t: t.size)
    if len(tables) > 1:
        detail["tablesFound"] = len(tables)
    if isinstance(best.columns, pd.MultiIndex):
        best.columns = [" ".join(str(p) for p in c if not str(p).startswith("Unnamed")).strip()
                        for c in best.columns]
    return best


# ─────────────────────────────────────────────────────────────────────────────
# JSON and XML
# ─────────────────────────────────────────────────────────────────────────────

# Keys that hold descriptions of the data rather than the data: a list of
# field definitions under "schema" can be as long as the records themselves.
_NOT_DATA_KEYS = {"schema", "meta", "metadata", "_meta", "links", "_links", "errors", "warnings", "fields"}


def _largest_record_list(obj: Any, depth: int = 0) -> Optional[Tuple[List[Any], str]]:
    """The biggest list of objects within three levels, and the path to it."""
    best: Optional[Tuple[List[Any], str]] = None
    if isinstance(obj, list) and obj and sum(isinstance(x, dict) for x in obj[:50]) >= min(len(obj), 50) * 0.8:
        best = (obj, "")
    if isinstance(obj, dict) and depth < 3:
        for k, v in obj.items():
            if str(k).lower() in _NOT_DATA_KEYS:
                continue
            found = _largest_record_list(v, depth + 1)
            if found and (best is None or len(found[0]) > len(best[0])):
                best = (found[0], f"{k}.{found[1]}".rstrip("."))
    return best


def _records_frame(obj: Any, detail: Dict[str, Any]) -> pd.DataFrame:
    if isinstance(obj, dict) and obj.get("type") == "FeatureCollection" and isinstance(obj.get("features"), list):
        detail["shape"] = "geojson"
        rows = []
        for f in obj["features"]:
            if not isinstance(f, dict):
                continue
            props = dict(f.get("properties") or {})
            geom = f.get("geometry") or {}
            props["geometry_type"] = geom.get("type")
            coords = geom.get("coordinates")
            if geom.get("type") == "Point" and isinstance(coords, list) and len(coords) >= 2:
                props["longitude"], props["latitude"] = coords[0], coords[1]
            rows.append(props)
        return pd.json_normalize(rows, max_level=2)

    if isinstance(obj, list) and obj and all(isinstance(r, list) for r in obj[:50]):
        first = obj[0]
        if all(isinstance(v, str) for v in first) and len(obj) > 1:
            detail["shape"] = "rows with header"
            return pd.DataFrame(obj[1:], columns=first)
        detail["shape"] = "rows"
        return pd.DataFrame(obj)

    if (isinstance(obj, dict) and isinstance(obj.get("columns"), list) and isinstance(obj.get("data"), list)
            and all(isinstance(r, list) for r in obj["data"][:50])):
        # pandas' "split" layout: {"columns": [...], "index": [...], "data": [[...]]}
        detail["shape"] = "split"
        return pd.DataFrame(obj["data"], columns=obj["columns"])

    if isinstance(obj, dict) and obj and all(isinstance(v, list) for v in obj.values()):
        lengths = {len(v) for v in obj.values()}
        if len(lengths) == 1 and not any(isinstance(x, dict) for v in obj.values() for x in v[:5]):
            detail["shape"] = "columns"
            return pd.DataFrame(obj)

    if isinstance(obj, dict) and len(obj) > 1 and all(isinstance(v, dict) for v in obj.values()):
        # {a: {k: v}} is either {column: {row: value}} or {row: {column: value}}.
        # A table has more rows than columns, so the side with more keys is
        # the rows.
        inner = int(np.median([len(v) for v in obj.values()]))
        if inner > len(obj):
            detail["shape"] = "columns keyed by row"
            return pd.DataFrame(obj).reset_index(drop=True)

    found = _largest_record_list(obj)
    if found:
        records, path = found
        detail["shape"] = "records"
        if path:
            detail["recordsAt"] = path
        return pd.json_normalize(records, max_level=2)

    if isinstance(obj, dict) and obj and all(isinstance(v, dict) for v in obj.values()):
        detail["shape"] = "keyed records"
        frame = pd.DataFrame.from_dict(obj, orient="index")
        frame.index.name = "key"
        return frame.reset_index()

    raise UnsupportedFile("The JSON file does not contain a table: expected a list of records "
                          "or an object of equal-length columns.")


def _read_json(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    text, encoding = _decode_text(data)
    detail["encoding"] = encoding
    try:
        obj = json.loads(text)
    except ValueError as exc:
        raise UnsupportedFile(f"The file is not valid JSON ({exc.msg} at line {exc.lineno}).")
    return _records_frame(obj, detail)


def _read_jsonl(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    text, encoding = _decode_text(data)
    detail["encoding"] = encoding
    records, bad = [], 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except ValueError:
            bad += 1
            continue
        if isinstance(value, dict):
            records.append(value)
        else:
            bad += 1
    if not records or bad > 0.1 * (len(records) + bad):
        raise UnsupportedFile("The file is not valid JSON Lines: most lines are not JSON objects.")
    if bad:
        detail["skippedLines"] = bad
    return pd.json_normalize(records, max_level=2)


def _local(tag: Any) -> str:
    tag = str(tag)
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def _read_xml(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    try:
        from lxml import etree
    except ImportError:
        raise UnsupportedFile("XML files cannot be read on this server yet.")
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             dtd_validation=False, huge_tree=False, remove_comments=True,
                             remove_pis=True)
    try:
        root = etree.fromstring(data, parser)
    except etree.XMLSyntaxError as exc:
        raise UnsupportedFile(f"The file is not valid XML ({exc.msg}).")
    if root is None:
        raise UnsupportedFile("The XML file is empty.")

    # The record element is the child tag that repeats most under one parent.
    best_parent, best_tag, best_count, seen = None, None, 0, 0
    frontier = [root]
    for _ in range(4):
        nxt = []
        for el in frontier:
            kids = [k for k in el if isinstance(k.tag, str)]
            seen += len(kids)
            if seen > MAX_XML_ELEMENTS:
                raise UnsupportedFile("The XML file has more elements than DIG can read.")
            if kids:
                tag, count = Counter(k.tag for k in kids).most_common(1)[0]
                if count > best_count:
                    best_parent, best_tag, best_count = el, tag, count
            nxt.extend(kids)
        frontier = nxt
    if best_count < 2:
        raise UnsupportedFile("No repeating records were found in this XML file.")

    rows = []
    for rec in best_parent:
        if rec.tag != best_tag:
            continue
        row: Dict[str, Any] = {_local(k): v for k, v in rec.attrib.items()}
        for child in rec:
            if not isinstance(child.tag, str):
                continue
            name = _local(child.tag)
            grandkids = [g for g in child if isinstance(g.tag, str)]
            if grandkids:
                for g in grandkids:
                    key = f"{name}.{_local(g.tag)}"
                    value = (g.text or "").strip()
                    row[key] = f"{row[key]}; {value}" if key in row else value
            else:
                value = (child.text or "").strip()
                for ak, av in child.attrib.items():
                    row[f"{name}.{_local(ak)}"] = av
                row[name] = f"{row[name]}; {value}" if name in row else value
        if not row and (rec.text or "").strip():
            row[_local(rec.tag)] = rec.text.strip()
        rows.append(row)
    detail["recordElement"] = _local(best_tag)
    frame = pd.DataFrame(rows)
    # XML text is all strings; empty elements are missing values.
    return frame.replace("", np.nan)


# ─────────────────────────────────────────────────────────────────────────────
# Columnar, statistical and database formats
# ─────────────────────────────────────────────────────────────────────────────

def _needs(module: str, label: str) -> None:
    try:
        __import__(module)
    except ImportError:
        raise UnsupportedFile(f"{label} files cannot be read on this server yet.")


def _read_parquet(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    _needs("pyarrow", "Parquet")
    return pd.read_parquet(io.BytesIO(data))


def _read_feather(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    _needs("pyarrow", "Feather")
    try:
        return pd.read_feather(io.BytesIO(data))
    except Exception:
        import pyarrow.ipc as ipc
        return ipc.open_stream(io.BytesIO(data)).read_all().to_pandas()


def _read_orc(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    _needs("pyarrow", "ORC")
    try:
        return pd.read_orc(io.BytesIO(data))
    except (ImportError, NotImplementedError):
        raise UnsupportedFile("ORC files cannot be read on this server yet.")


def _read_stata(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    try:
        return pd.read_stata(io.BytesIO(data), convert_categoricals=True)
    except ValueError:
        # Value labels that are not unique cannot become categories; read
        # the codes instead.
        detail["valueLabels"] = "not applied (labels were not unique)"
        return pd.read_stata(io.BytesIO(data), convert_categoricals=False)


def _read_sas(data: bytes, fmt: str, detail: Dict[str, Any]) -> pd.DataFrame:
    # pyreadstat reads both transport versions and compressed sas7bdat;
    # pandas reads only transport version 5.
    try:
        import pyreadstat
    except ImportError:
        pyreadstat = None
    if pyreadstat is not None:
        reader = pyreadstat.read_sas7bdat if fmt == "sas7bdat" else pyreadstat.read_xport
        try:
            return _with_temp_file(data, f".{fmt}", lambda path: reader(path)[0])
        except Exception:
            pass  # fall through to pandas, which reads some files pyreadstat rejects
    if fmt == "sas7bdat":
        return pd.read_sas(io.BytesIO(data), format="sas7bdat", encoding="infer")
    return pd.read_sas(io.BytesIO(data), format="xport", encoding="latin-1")


def _with_temp_file(data: bytes, suffix: str, fn: Callable[[str], pd.DataFrame]) -> pd.DataFrame:
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return fn(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _read_spss(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    _needs("pyreadstat", "SPSS")
    import pyreadstat

    def read(path: str) -> pd.DataFrame:
        df, meta = pyreadstat.read_sav(path, apply_value_formats=True)
        return df
    return _with_temp_file(data, ".sav", read)


def _read_sqlite(data: bytes, detail: Dict[str, Any]) -> pd.DataFrame:
    def read(path: str) -> pd.DataFrame:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            con.execute("PRAGMA trusted_schema = OFF")
            names = [r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
            if not names:
                raise UnsupportedFile("The database has no tables.")
            if len(names) > MAX_SQLITE_TABLES:
                names = names[:MAX_SQLITE_TABLES]

            def quoted(n: str) -> str:
                return '"' + n.replace('"', '""') + '"'

            sizes = {}
            for n in names:
                try:
                    sizes[n] = con.execute(f"SELECT COUNT(*) FROM {quoted(n)}").fetchone()[0]
                except sqlite3.DatabaseError:
                    continue
            if not sizes:
                raise UnsupportedFile("None of the database's tables could be read.")
            table = max(sizes, key=sizes.get)
            if sizes[table] > MAX_ROWS:
                raise _too_many_rows(sizes[table])
            detail["table"] = table
            others = [n for n in sizes if n != table]
            if others:
                detail["otherTables"] = others[:20]
            return pd.read_sql_query(f"SELECT * FROM {quoted(table)}", con)
        except sqlite3.DatabaseError as exc:
            raise UnsupportedFile(f"The database could not be read ({exc}).")
        finally:
            con.close()
    return _with_temp_file(data, ".sqlite", read)


def _too_many_rows(n: int) -> UnsupportedFile:
    return UnsupportedFile(f"The file has {n:,} rows. DIG analyses files of up to {MAX_ROWS:,} rows; "
                           "split it or upload a summary.")


_READERS: Dict[str, Callable[[bytes, Dict[str, Any]], pd.DataFrame]] = {
    "text": _read_text,
    "xlsx": lambda d, det: _read_excel(d, "xlsx", det),
    "xls": lambda d, det: _read_excel(d, "xls", det),
    "ods": lambda d, det: _read_excel(d, "ods", det),
    "html": _read_html,
    "json": _read_json,
    "jsonl": _read_jsonl,
    "xml": _read_xml,
    "parquet": _read_parquet,
    "feather": _read_feather,
    "orc": _read_orc,
    "dta": _read_stata,
    "sas7bdat": lambda d, det: _read_sas(d, "sas7bdat", det),
    "xpt": lambda d, det: _read_sas(d, "xpt", det),
    "sav": _read_spss,
    "sqlite": _read_sqlite,
}


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation
# ─────────────────────────────────────────────────────────────────────────────

def _column_names(columns) -> List[str]:
    if isinstance(columns, pd.MultiIndex):
        raw = [" ".join(str(p) for p in c if str(p) != "nan" and not str(p).startswith("Unnamed")).strip()
               for c in columns]
    else:
        raw = [str(c) for c in columns]
    names, used = [], Counter()
    for i, name in enumerate(raw):
        name = " ".join(name.replace("\r", " ").replace("\n", " ").split())
        if not name or name.lower() == "nan" or name.startswith("Unnamed:"):
            name = f"column_{i + 1}"
        used[name] += 1
        if used[name] > 1:
            name = f"{name}_{used[name]}"
            while name in used:
                name += "_"
            used[name] += 1
        names.append(name)
    return names


def _is_row_number(name: str, values: pd.Series) -> bool:
    name = name.strip().lower()
    if not (name in ("", "nan", "index", "level_0") or name.startswith("unnamed:")):
        return False
    if not pd.api.types.is_integer_dtype(values) or values.isna().any() or len(values) < 2:
        return False
    first = int(values.iloc[0])
    return first in (0, 1) and bool((values.to_numpy() == np.arange(first, first + len(values))).all())


def _to_text(v: Any) -> Any:
    if isinstance(v, (dict, list, tuple)):
        try:
            return json.dumps(v, ensure_ascii=False, default=str)[:1000]
        except (TypeError, ValueError):
            return str(v)[:1000]
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).decode("utf-8", errors="replace")
    return v


def normalise(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """The same clean-up for every format. Returns (frame, notes)."""
    notes: List[str] = []
    df = df.copy()
    original_names = [str(c) for c in df.columns]
    if len(df.columns) > 1 and _is_row_number(original_names[0], df.iloc[:, 0]):
        # The row index an export wrote out ("Unnamed: 0" with 0, 1, 2, ...).
        # Analysed, it would show up as a perfectly trending "measure".
        df = df.iloc[:, 1:]
        original_names = original_names[1:]
        notes.append("Dropped the row-number column the export added.")
    df.columns = _column_names(df.columns)
    renamed = sum(1 for a, b in zip(original_names, df.columns) if a != b)
    if renamed:
        notes.append(f"Renamed {renamed} blank or duplicate column name{'s' if renamed != 1 else ''}.")

    empty_cols = [c for c in df.columns if df[c].isna().all()]
    if empty_cols:
        df = df.drop(columns=empty_cols)
        notes.append(f"Dropped {len(empty_cols)} empty column{'s' if len(empty_cols) != 1 else ''}"
                     f": {', '.join(empty_cols[:5])}{'…' if len(empty_cols) > 5 else ''}.")
    before = len(df)
    df = df.dropna(how="all")
    if len(df) < before:
        notes.append(f"Dropped {before - len(df):,} empty row{'s' if before - len(df) != 1 else ''}.")
    df = df.reset_index(drop=True)

    for col in df.columns:
        s = df[col]
        if isinstance(s.dtype, pd.DatetimeTZDtype):
            df[col] = s.dt.tz_convert("UTC").dt.tz_localize(None)
        elif pd.api.types.is_object_dtype(s):
            sample = s.dropna().head(200)
            if any(isinstance(v, (dict, list, tuple, bytes, bytearray)) for v in sample):
                s = s.map(_to_text)
            # Trim only real strings: .str.strip() on an object column turns
            # its numbers into NaN.
            s = s.map(lambda v: v.strip() if isinstance(v, str) else v)
            df[col] = s.replace("", np.nan)
        elif pd.api.types.is_string_dtype(s):
            df[col] = s.str.strip().replace("", np.nan)

    if len(df.columns) > MAX_COLUMNS:
        raise UnsupportedFile(f"The file has {len(df.columns):,} columns. DIG analyses up to {MAX_COLUMNS:,}.")
    if len(df) > MAX_ROWS:
        raise _too_many_rows(len(df))
    return df.infer_objects(), notes


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

_REFUSALS = {
    "pdf": "PDF files are documents, not data tables. Export the table as CSV or Excel and upload that.",
    "office_document": "This is a Word, PowerPoint or other office document, not a data table. "
                       "Export the table as CSV or Excel and upload that.",
    "binary": "This file type is not supported. Upload CSV, Excel, JSON, Parquet or one of the other listed formats.",
}


def load_table(data: bytes, file_name: str = "", _depth: int = 0) -> LoadedTable:
    """
    Read `data` into a normalised table. Raises UnsupportedFile with a message
    fit for the user when the bytes are not a table DIG can read.
    """
    if not data:
        raise UnsupportedFile("The file is empty.")
    fmt = detect_format(data, file_name)

    if fmt in ("gzip", "bz2", "xz"):
        if _depth >= 2:
            raise UnsupportedFile("The file is compressed more than twice over.")
        opener = {"gzip": gzip.GzipFile, "bz2": bz2.BZ2File, "xz": lzma.LZMAFile}[fmt]
        try:
            inner = _bounded_read(opener(fileobj=io.BytesIO(data)) if fmt == "gzip" else opener(io.BytesIO(data)))
        except (OSError, EOFError, lzma.LZMAError) as exc:
            raise UnsupportedFile(f"The compressed file is damaged ({type(exc).__name__}).")
        inner_name = _strip_ext(file_name, {"gzip": ".gz", "bz2": ".bz2", "xz": ".xz"}[fmt])
        table = load_table(inner, inner_name, _depth + 1)
        table.detail["compression"] = fmt
        return table
    if fmt == "zip":
        if _depth >= 2:
            raise UnsupportedFile("The archive is nested too deeply.")
        inner, inner_name = _unzip(data)
        table = load_table(inner, inner_name, _depth + 1)
        table.detail["archiveEntry"] = inner_name
        return table
    if fmt in _REFUSALS:
        raise UnsupportedFile(_REFUSALS[fmt])

    detail: Dict[str, Any] = {}
    reader = _READERS[fmt]
    try:
        df = reader(data, detail)
    except UnsupportedFile:
        raise
    except MemoryError:
        raise UnsupportedFile("The file is too large to read on this server.")
    except Exception as exc:
        raise UnsupportedFile(f"The file could not be read as {FORMAT_LABELS.get(fmt, fmt)} "
                              f"({type(exc).__name__}: {str(exc)[:160]}).")

    if df is None or df.empty or len(df.columns) == 0:
        raise UnsupportedFile("The file was read, but it contains no rows of data.")
    df, notes = normalise(df)
    if df.empty:
        raise UnsupportedFile("The file was read, but every row was empty.")
    left_out = _left_out_note(detail)
    if left_out:
        notes.insert(0, left_out)
    df, conversions = coerce_types(df)
    parsed = [c for c in conversions if c.get("kind") != "plain"]
    if parsed:
        names = ", ".join(c["column"] for c in parsed[:5])
        notes.append(f"Read {len(parsed)} column{'s' if len(parsed) != 1 else ''} of numbers written as text "
                     f"(currency, percentages or separators): {names}{'…' if len(parsed) > 5 else ''}.")
    return LoadedTable(df=df, format=fmt, detail=detail, notes=notes, conversions=conversions)
