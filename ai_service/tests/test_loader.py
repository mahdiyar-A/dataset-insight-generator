"""
The file reader: every supported format, the shapes real exports come in,
and the files it must refuse with a message the user can act on.
"""

import bz2
import gzip
import io
import json
import lzma
import os
import sqlite3
import zipfile

import numpy as np
import pandas as pd
import pytest

import ai_engine.ingest.loader as loader
from ai_engine.ingest import UnsupportedFile, detect_format, load_table

N = 120


@pytest.fixture(scope="module")
def base() -> pd.DataFrame:
    rng = np.random.default_rng(0)
    return pd.DataFrame({
        "order_id": [f"A{i:05d}" for i in range(N)],
        "date": pd.date_range("2024-01-01", periods=N, freq="D"),
        "region": rng.choice(["North", "South", "East"], N),
        "revenue": rng.gamma(2, 100, N).round(2),
        "units": rng.integers(1, 20, N),
    })


def _same_shape(table, rows=N, columns=5):
    assert (len(table.df), len(table.df.columns)) == (rows, columns), table.df.columns.tolist()


def _numeric(table, *columns):
    for c in columns:
        assert pd.api.types.is_numeric_dtype(table.df[c]), (c, table.df[c].dtype)


# ── Delimited text ────────────────────────────────────────────────────────────

def test_csv(base):
    t = load_table(base.to_csv(index=False).encode(), "orders.csv")
    assert t.format == "text" and t.detail["delimiter"] == ","
    _same_shape(t)
    _numeric(t, "revenue", "units")
    assert t.df["order_id"].iloc[0] == "A00000"


@pytest.mark.parametrize("sep,name,label", [("\t", "x.tsv", "tab"), ("|", "x.txt", "|"), (";", "x.csv", ";")])
def test_other_delimiters(base, sep, name, label):
    t = load_table(base.to_csv(index=False, sep=sep).encode(), name)
    assert t.detail["delimiter"] == label
    _same_shape(t)


def test_european_csv_with_decimal_commas(base):
    eu = base.copy()
    eu["revenue"] = eu["revenue"].map(lambda v: f"{v:.2f}".replace(".", ","))
    t = load_table(eu.to_csv(index=False, sep=";").encode("cp1252"), "x.csv")
    _same_shape(t)
    _numeric(t, "revenue")
    assert t.df["revenue"].sum() == pytest.approx(base["revenue"].sum(), rel=1e-9)


def test_title_rows_above_the_header_are_skipped(base):
    data = ("Sales report,,,,\nGenerated 3 Nov,,,,\n,,,,\n" + base.to_csv(index=False)).encode()
    t = load_table(data, "x.csv")
    assert list(t.df.columns) == list(base.columns)
    assert t.detail["skippedTitleRows"] >= 2
    _same_shape(t)


def test_whitespace_aligned_text(base):
    t = load_table(base[["region", "revenue", "units"]].to_string(index=False).encode(), "x.txt")
    assert t.detail["delimiter"] == "whitespace"
    _same_shape(t, columns=3)


def test_utf16_text_from_excel(base):
    t = load_table(base.to_csv(index=False, sep="\t").encode("utf-16"), "x.txt")
    assert t.detail["encoding"] == "utf-16"
    _same_shape(t)


def test_currency_strings_become_numbers_with_a_note(base):
    money = base.copy()
    money["revenue"] = money["revenue"].map(lambda v: f"${v:,.2f}")
    t = load_table(money.to_csv(index=False).encode(), "x.csv")
    _numeric(t, "revenue")
    assert any("numbers written as text" in n for n in t.notes)
    assert t.df["revenue"].sum() == pytest.approx(base["revenue"].sum(), rel=1e-9)


def test_codes_with_leading_zeros_stay_text():
    data = "zip,amount\n" + "\n".join(f"{i:05d},{i}" for i in range(1, 60))
    t = load_table(data.encode(), "x.csv")
    assert t.df["zip"].iloc[0] == "00001"
    _numeric(t, "amount")


def test_duplicate_and_blank_headers_are_renamed():
    t = load_table(b"a,a,,b\n1,2,3,4\n5,6,7,8\n", "x.csv")
    assert len(set(t.df.columns)) == 4
    assert any("Renamed" in n for n in t.notes)


def test_row_number_column_from_an_export_is_dropped(base):
    t = load_table(base.to_csv(index=True).encode(), "x.csv")
    _same_shape(t)
    assert any("row-number" in n for n in t.notes)


def test_a_single_column_file_is_read():
    t = load_table(b"a\n1\n2\n3\n", "x.csv")
    assert list(t.df.columns) == ["a"] and len(t.df) == 3


# ── Spreadsheets ──────────────────────────────────────────────────────────────

def test_xlsx_picks_the_data_sheet_and_lists_the_others(base):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        pd.DataFrame({"note": ["read me"]}).to_excel(w, sheet_name="Notes", index=False)
        base.to_excel(w, sheet_name="Data", index=False)
    t = load_table(buf.getvalue(), "x.xlsx")
    assert t.format == "xlsx" and t.detail["sheet"] == "Data" and "Notes" in t.detail["otherSheets"]
    _same_shape(t)


def test_xlsx_title_rows_and_a_wrong_extension(base):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        base.to_excel(w, sheet_name="Data", index=False, startrow=3)
        w.sheets["Data"]["A1"] = "Quarterly sales"
    # Named .csv: the content decides, not the extension.
    t = load_table(buf.getvalue(), "export.csv")
    assert t.format == "xlsx"
    assert list(t.df.columns) == list(base.columns)
    _same_shape(t)


def test_ods(base):
    buf = io.BytesIO()
    base.to_excel(buf, engine="odf", index=False)
    t = load_table(buf.getvalue(), "x.ods")
    assert t.format == "ods"
    _same_shape(t)


def test_html_table_saved_as_xls(base):
    t = load_table(base.head(50).to_html(index=False).encode(), "report.xls")
    assert t.format == "html"
    _same_shape(t, rows=50)


# ── JSON ──────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def records(base):
    return json.loads(base.to_json(orient="records", date_format="iso"))


def test_json_records(records):
    _same_shape(load_table(json.dumps(records).encode(), "x.json"))


def test_json_records_inside_a_wrapper(records):
    t = load_table(json.dumps({"meta": {"v": 1}, "data": records}).encode(), "x.json")
    assert t.detail["recordsAt"] == "data"
    _same_shape(t)


def test_json_column_orientation(base):
    t = load_table(base.to_json(orient="columns").encode(), "x.json")
    _same_shape(t)
    assert "revenue" in t.df.columns


def test_json_list_of_lists_with_header(base):
    rows = [list(base.columns)] + base.astype(str).values.tolist()
    t = load_table(json.dumps(rows).encode(), "x.json")
    assert t.detail["shape"] == "rows with header"
    _same_shape(t)


def test_nested_json_is_flattened():
    nested = [{"id": i, "customer": {"name": f"c{i}", "tier": "gold" if i % 3 else "silver"},
               "tags": ["a", "b"], "amount": float(i * 1.5)} for i in range(60)]
    t = load_table(json.dumps(nested).encode(), "x.json")
    assert {"customer.name", "customer.tier", "amount"} <= set(t.df.columns)
    assert isinstance(t.df["tags"].iloc[0], str)   # lists become text, not objects


def test_json_lines_with_either_extension(records):
    data = "\n".join(json.dumps(r) for r in records).encode()
    for name in ("x.jsonl", "x.json"):
        t = load_table(data, name)
        assert t.format == "jsonl"
        _same_shape(t)


def test_geojson_properties_become_rows():
    geo = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": f"p{i}", "pop": i * 10},
         "geometry": {"type": "Point", "coordinates": [-79.3 + i / 100, 43.6]}} for i in range(40)]}
    t = load_table(json.dumps(geo).encode(), "x.geojson")
    assert t.detail["shape"] == "geojson" and len(t.df) == 40 and "pop" in t.df.columns


def test_broken_json_is_refused_with_the_format_named():
    with pytest.raises(UnsupportedFile, match="JSON"):
        load_table(b'{"a": [1, 2', "x.json")


# ── XML ───────────────────────────────────────────────────────────────────────

def test_xml_repeating_elements(base):
    xml = "<?xml version='1.0'?><orders>" + "".join(
        f"<order id='{r.order_id}'><region>{r.region}</region><revenue>{r.revenue}</revenue>"
        f"<units>{r.units}</units></order>" for r in base.itertuples()) + "</orders>"
    t = load_table(xml.encode(), "x.xml")
    assert t.detail["recordElement"] == "order" and len(t.df) == N
    _numeric(t, "revenue")


def test_xml_external_entities_are_not_resolved():
    xxe = b"""<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<rows><row><a>&x;</a><b>1</b></row><row><a>2</a><b>3</b></row></rows>"""
    try:
        t = load_table(xxe, "x.xml")
    except UnsupportedFile:
        return
    assert "root:" not in " ".join(map(str, t.df.to_numpy().ravel()))


def test_xml_entity_expansion_bomb_does_not_expand():
    bomb = b"""<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">
<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]>
<rows><row><a>&lol3;</a></row><row><a>1</a></row></rows>"""
    try:
        t = load_table(bomb, "x.xml")
    except UnsupportedFile:
        return
    assert max(len(str(v)) for v in t.df.to_numpy().ravel()) < 100


# ── Columnar and statistics formats ───────────────────────────────────────────

def test_parquet_and_feather_keep_types(base):
    for writer, name in ((base.to_parquet, "x.parquet"), (base.to_feather, "x.feather")):
        buf = io.BytesIO()
        writer(buf)
        t = load_table(buf.getvalue(), name)
        _same_shape(t)
        assert pd.api.types.is_datetime64_any_dtype(t.df["date"])


def test_stata(base):
    buf = io.BytesIO()
    base.to_stata(buf, write_index=False)
    t = load_table(buf.getvalue(), "x.dta")
    assert t.format == "dta"
    _same_shape(t)


def test_spss_and_sas_transport(base, tmp_path):
    pyreadstat = pytest.importorskip("pyreadstat")
    sav = base.copy()
    sav["date"] = sav["date"].dt.date
    pyreadstat.write_sav(sav, str(tmp_path / "x.sav"))
    t = load_table((tmp_path / "x.sav").read_bytes(), "x.sav")
    assert t.format == "sav"
    _same_shape(t)
    pyreadstat.write_xport(base[["region", "revenue", "units"]], str(tmp_path / "x.xpt"))
    t = load_table((tmp_path / "x.xpt").read_bytes(), "x.xpt")
    assert t.format == "xpt"
    _same_shape(t, columns=3)


def test_sqlite_reads_the_largest_table(base, tmp_path):
    path = tmp_path / "x.db"
    con = sqlite3.connect(path)
    base.to_sql("orders", con, index=False)
    pd.DataFrame({"k": [1, 2]}).to_sql("lookup", con, index=False)
    con.execute("CREATE VIEW v AS SELECT * FROM orders")
    con.commit()
    con.close()
    t = load_table(path.read_bytes(), "x.db")
    assert t.detail["table"] == "orders" and "lookup" in t.detail["otherTables"]
    _same_shape(t)


# ── Compression ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("compress,name", [(gzip.compress, "x.csv.gz"), (bz2.compress, "x.csv.bz2"),
                                           (lzma.compress, "x.csv.xz")])
def test_compressed_csv(base, compress, name):
    t = load_table(compress(base.to_csv(index=False).encode()), name)
    assert t.detail["compression"] in ("gzip", "bz2", "xz")
    _same_shape(t)


def test_zip_takes_the_data_file_and_skips_mac_junk(base):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", "about")
        z.writestr("__MACOSX/._data.csv", "junk")
        z.writestr("export/data.csv", base.to_csv(index=False))
    t = load_table(buf.getvalue(), "x.zip")
    assert t.detail["archiveEntry"] == "data.csv"
    _same_shape(t)


def test_decompression_bombs_are_stopped(monkeypatch):
    monkeypatch.setattr(loader, "MAX_DECOMPRESSED_BYTES", 2 * 1024 * 1024)
    zeros = b"0" * (5 * 1024 * 1024)
    with pytest.raises(UnsupportedFile, match="expands"):
        load_table(gzip.compress(zeros), "x.csv.gz")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("big.csv", zeros)
    with pytest.raises(UnsupportedFile, match="expands"):
        load_table(buf.getvalue(), "x.zip")


def test_compression_nested_too_deep_is_refused(base):
    data = base.to_csv(index=False).encode()
    with pytest.raises(UnsupportedFile):
        load_table(gzip.compress(gzip.compress(gzip.compress(data))), "x.csv.gz.gz.gz")


# ── Refusals ──────────────────────────────────────────────────────────────────

def test_documents_and_junk_are_refused_with_advice():
    with pytest.raises(UnsupportedFile, match="empty"):
        load_table(b"", "x.csv")
    with pytest.raises(UnsupportedFile, match="PDF"):
        load_table(b"%PDF-1.7 ...", "x.pdf")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w/>")
        z.writestr("[Content_Types].xml", "<t/>")
    with pytest.raises(UnsupportedFile, match="office document"):
        load_table(buf.getvalue(), "x.docx")
    with pytest.raises(UnsupportedFile, match="not supported"):
        load_table(bytes(range(256)) * 10, "x.bin")


def test_too_many_columns_is_refused(monkeypatch):
    monkeypatch.setattr(loader, "MAX_COLUMNS", 10)
    wide = pd.DataFrame(np.ones((5, 12)), columns=[f"c{i}" for i in range(12)])
    with pytest.raises(UnsupportedFile, match="columns"):
        load_table(wide.to_csv(index=False).encode(), "x.csv")


def test_detection_ignores_a_misleading_extension(base):
    buf = io.BytesIO()
    base.to_parquet(buf)
    assert detect_format(buf.getvalue(), "data.csv") == "parquet"
    assert detect_format(b"%PDF-1.4", "table.xlsx") == "pdf"
    assert detect_format(b'{"a": 1}\n{"a": 2}\n{"a": 3}\n', "x.json") == "jsonl"


def test_summary_is_what_the_upload_form_shows(base):
    s = load_table(base.to_csv(index=False).encode(), "x.csv").summary(3)
    assert s["formatLabel"] and s["rows"] == N and s["columns"] == 5
    assert s["headers"] == list(base.columns) and len(s["preview"]) == 3
    json.dumps(s)   # goes over HTTP as is
