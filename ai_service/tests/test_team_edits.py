"""
Two people saving the same report: report_document.merge and /report/rebuild
with base_json. Each part takes the side that changed it; a part both changed
differently is refused, naming it, so nobody's words are silently lost.
"""
import copy
import json

import pytest

from ai_engine import report_document as rd
from test_editable_report import PNG, _original, _pdf_text


def _edit(doc, change):
    edited = copy.deepcopy(doc)
    change(edited)
    return edited


def _save(base, theirs, change):
    """What a person who opened `base` saves, merged with `theirs`, saved since."""
    original = _original()
    mine = rd.apply_edits(original, _edit(base, change), rd.added_of(theirs))
    return rd.merge(base, theirs, mine)


def _stored(original, change):
    """A version someone saved: an edit of the original, as the server keeps it."""
    return rd.apply_edits(original, _edit(original, change), rd.added_of(original))


def _set(path, value):
    def change(doc):
        node = doc
        for step in path[:-1]:
            node = node[step]
        node[path[-1]] = value
    return change


def _ids(doc):
    return [i["id"] for i in doc["insights"]]


# ── Different parts ───────────────────────────────────────────────────────────

def test_changes_to_different_parts_are_both_kept():
    base = _original()
    theirs = _stored(base, _set(["text", "reportTitle"], "Their title"))
    merged = _save(base, theirs, _set(["text", "conclusion"], "My conclusion."))
    assert merged["text"]["reportTitle"] == "Their title"
    assert merged["text"]["conclusion"] == "My conclusion."


def test_an_insight_and_an_answer_changed_by_different_people_are_both_kept():
    base = _original()
    theirs = _stored(base, _set(["questionAnswers", 0, "answer"], "The South, clearly."))
    merged = _save(base, theirs, _set(["insights", 0, "body"], "North brings 42% of all revenue."))
    assert merged["questionAnswers"][0]["answer"] == "The South, clearly."
    assert merged["insights"][0]["body"] == "North brings 42% of all revenue."


def test_the_same_change_made_by_both_is_not_a_clash():
    base = _original()
    theirs = _stored(base, _set(["text", "conclusion"], "Same words."))
    merged = _save(base, theirs, _set(["text", "conclusion"], "Same words."))
    assert merged["text"]["conclusion"] == "Same words."


def test_words_dig_wrote_sent_back_untouched_do_not_count_as_a_change():
    # Version 1 keeps the model's spacing; an edit sends it back cleaned.
    base = _original()
    base["text"]["executiveSummary"] = "North   brings 42%\n\n\n\nof revenue.  "
    theirs = rd.apply_edits(base, _edit(base, _set(["text", "executiveSummary"], "Their summary.")),
                            rd.added_of(base))
    mine = rd.apply_edits(base, _edit(base, _set(["text", "conclusion"], "Mine.")), rd.added_of(theirs))
    merged = rd.merge(base, theirs, mine)
    assert merged["text"]["executiveSummary"] == "Their summary."
    assert merged["text"]["conclusion"] == "Mine."


def test_their_new_order_and_my_new_words_are_both_kept():
    base = _original()
    theirs = _stored(base, lambda d: d["insights"].reverse())
    merged = _save(base, theirs, _set(["insights", 0, "title"], "North leads by far"))
    assert _ids(merged) == ["i3", "i2", "i1"]
    assert merged["insights"][2]["title"] == "North leads by far"


# ── The same part ─────────────────────────────────────────────────────────────

def test_the_same_part_changed_differently_is_refused_and_named():
    base = _original()
    theirs = _stored(base, _set(["text", "conclusion"], "Theirs."))
    with pytest.raises(rd.SamePart) as caught:
        _save(base, theirs, _set(["text", "conclusion"], "Mine."))
    assert caught.value.parts == [{"section": "conclusion"}]


def test_every_clashing_part_is_named():
    base = _original()
    theirs = _stored(base, lambda d: (d["insights"][1].update(body="Their body."),
                                      d["charts"][0].update(label="Their label")))
    with pytest.raises(rd.SamePart) as caught:
        _save(base, theirs, lambda d: (d["insights"][1].update(body="My body."),
                                       d["charts"][0].update(label="My label")))
    assert caught.value.parts == [{"section": "insight", "id": "i2", "field": "body"},
                                  {"section": "chart", "file": 0, "field": "label"}]


def test_removing_an_insight_someone_else_changed_is_a_clash():
    base = _original()
    theirs = _stored(base, _set(["insights", 1, "body"], "South loses the most, by far."))
    with pytest.raises(rd.SamePart) as caught:
        _save(base, theirs, lambda d: d["insights"].pop(1))
    assert {"section": "insight", "id": "i2", "field": "body"} in caught.value.parts


def test_changing_an_insight_someone_else_removed_is_a_clash():
    base = _original()
    theirs = _stored(base, lambda d: d["insights"].pop(1))
    with pytest.raises(rd.SamePart) as caught:
        _save(base, theirs, _set(["insights", 1, "body"], "South loses the most, by far."))
    assert {"section": "insight", "id": "i2", "field": "body"} in caught.value.parts


def test_two_different_orders_are_a_clash():
    base = _original()
    theirs = _stored(base, lambda d: d["insights"].reverse())
    with pytest.raises(rd.SamePart) as caught:
        _save(base, theirs, lambda d: d["insights"].insert(0, d["insights"].pop(1)))
    assert caught.value.parts == [{"section": "insightOrder"}]


# ── Charts under removed insights ─────────────────────────────────────────────

def test_a_chart_under_an_insight_they_removed_joins_the_other_charts():
    base = _original()
    assert base["charts"][0]["insight"] == "i1"
    theirs = _stored(base, lambda d: d["insights"].pop(0))
    merged = _save(base, theirs, _set(["text", "conclusion"], "Mine."))
    assert _ids(merged) == ["i2", "i3"]
    assert merged["charts"][0]["insight"] is None


def test_moving_a_chart_whose_insight_they_removed_is_not_a_clash():
    base = _original()
    theirs = _stored(base, lambda d: d["insights"].pop(0))
    merged = _save(base, theirs, _set(["charts", 0, "insight"], "i3"))
    assert merged["charts"][0]["insight"] == "i3"


# ── What DIG added, and what is fixed ─────────────────────────────────────────

def _with_added(doc):
    added = {"id": "a1", "title": "Added by DIG", "body": "Units rise with revenue.",
             "restsOn": ["F9"], "basedOn": ["units correlate with revenue"]}
    out = copy.deepcopy(doc)
    out["added"] = {"insights": [added], "charts": []}
    out["insights"].append(copy.deepcopy(added))
    return out


def test_an_insight_dig_added_since_is_kept_with_my_edit():
    base = _original()
    theirs = _with_added(base)
    merged = _save(base, theirs, _set(["insights", 0, "title"], "North leads by far"))
    assert _ids(merged) == ["i1", "i2", "i3", "a1"]
    assert merged["insights"][0]["title"] == "North leads by far"
    assert merged["added"]["insights"][0]["id"] == "a1"


def test_fixed_parts_come_from_the_newest_version():
    base = _original()
    theirs = _stored(base, _set(["text", "reportTitle"], "Their title"))
    merged = _save(base, theirs, _set(["insights", 0, "restsOn"], ["F99"]))
    assert merged["insights"][0]["restsOn"] == base["insights"][0]["restsOn"]
    assert merged["facts"] == base["facts"]


# ── The endpoint ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    import main
    return TestClient(main.app)


def _rebuild(client, edited, current, base):
    data = {"original_json": json.dumps(_original()), "edited_json": json.dumps(edited),
            "current_json": json.dumps(current), "base_json": json.dumps(base)}
    files = [("charts", (f"chart_{n}.png", PNG, "image/png")) for n in (0, 1)]
    return client.post("/report/rebuild", data=data, files=files)


def test_the_endpoint_combines_saves_and_builds_the_files_from_both(client):
    base = _original()
    theirs = _stored(base, _set(["text", "reportTitle"], "Their title"))
    reply = _rebuild(client, _edit(base, _set(["text", "conclusion"], "My conclusion.")), theirs, base)
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["document"]["text"]["reportTitle"] == "Their title"
    assert body["document"]["text"]["conclusion"] == "My conclusion."
    pdf = _pdf_text(body["pdf_report_base64"])
    assert b"Their title" in pdf and b"My conclusion." in pdf


def test_the_endpoint_refuses_a_clash_and_names_the_parts(client):
    base = _original()
    theirs = _stored(base, _set(["text", "conclusion"], "Theirs."))
    reply = _rebuild(client, _edit(base, _set(["text", "conclusion"], "Mine.")), theirs, base)
    assert reply.status_code == 422
    assert reply.json() == {"error": "same_part", "parts": [{"section": "conclusion"}]}


def test_the_endpoint_warns_only_about_figures_this_person_typed(client):
    base = _original()
    theirs = _stored(base, _set(["text", "executiveSummary"], "Revenue may reach 777,777."))
    reply = _rebuild(client, _edit(base, _set(["text", "conclusion"], "Costs may reach 123,456.")), theirs, base)
    assert reply.status_code == 200, reply.text
    assert reply.json()["warnings"] == [{"section": "conclusion", "numbers": ["123,456"]}]


def test_without_a_base_the_endpoint_saves_the_edit_as_before(client):
    base = _original()
    theirs = _stored(base, _set(["text", "reportTitle"], "Their title"))
    data = {"original_json": json.dumps(base),
            "edited_json": json.dumps(_edit(base, _set(["text", "conclusion"], "Mine."))),
            "current_json": json.dumps(theirs)}
    body = client.post("/report/rebuild", data=data).json()
    # No merge asked for: the edit is the whole document, as it always was.
    assert body["document"]["text"]["reportTitle"] == "Regional sales review"
    assert body["document"]["text"]["conclusion"] == "Mine."
