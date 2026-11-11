"""Business logic. No web framework imports, so it can be tested on its own."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import config, db, states
from .errors import BadRequest, Conflict, Forbidden, NotFound
from .extraction import revalidate_field, run_extraction

LANGS = {"en", "hi", "bn", "ta", "or"}
DATA_DIR = Path(__file__).resolve().parent / "data"


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _audit(c, report_id, action, actor=None, detail=None):
    c.execute(
        "INSERT INTO audit_log (report_id, action, actor, detail_json, ts) VALUES (?,?,?,?,?)",
        (report_id, action, actor, json.dumps(detail) if detail is not None else None, _now()),
    )


def _load(c, report_id):
    row = c.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if row is None:
        raise NotFound(f"report {report_id} not found")
    return row


def _set_status(c, current, new, report_id):
    states.require_move(current, new)
    c.execute("UPDATE reports SET status=?, updated_at=? WHERE id=?", (new, _now(), report_id))


def unresolved_count(fields):
    return sum(1 for f in fields if f["flag"] and not f.get("confirmed"))


def create_report(filename, data):
    if not filename or not filename.lower().endswith(".pdf"):
        raise BadRequest("only .pdf files are accepted")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise BadRequest("file is larger than 10 MB")
    if not data.startswith(b"%PDF"):
        raise BadRequest("file is not a valid PDF")

    report_id = "r_" + uuid.uuid4().hex[:8]
    path = config.upload_dir() / f"{report_id}.pdf"
    path.write_bytes(data)
    now = _now()

    with db.conn() as c:
        c.execute(
            "INSERT INTO reports (id, status, source_file, raw_text, fields_json, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (report_id, states.UPLOADED, filename, "", "[]", now, now),
        )
        _audit(c, report_id, "upload", detail={"filename": filename, "bytes": len(data)})

        result = run_extraction(str(path))
        fields = result["fields"]
        c.execute(
            "UPDATE reports SET raw_text=?, fields_json=?, updated_at=? WHERE id=?",
            (result["raw_text"], json.dumps(fields), _now(), report_id),
        )
        _set_status(c, states.UPLOADED, states.EXTRACTED, report_id)
        flagged = sum(1 for f in fields if f["flag"])
        _audit(c, report_id, "extract", detail={"fields": len(fields), "flagged": flagged})
        status = states.EXTRACTED
        if flagged:
            _set_status(c, states.EXTRACTED, states.NEEDS_REVIEW, report_id)
            _audit(c, report_id, "needs_review")
            status = states.NEEDS_REVIEW
    return {"report_id": report_id, "status": status}


def list_reports():
    with db.conn() as c:
        rows = c.execute("SELECT * FROM reports ORDER BY created_at DESC, rowid DESC").fetchall()
    out = []
    for r in rows:
        fields = json.loads(r["fields_json"])
        out.append({
            "report_id": r["id"],
            "status": r["status"],
            "source_file": r["source_file"],
            "created_at": r["created_at"],
            "unresolved_flags": unresolved_count(fields),
        })
    return out


def get_summary(report_id):
    with db.conn() as c:
        row = _load(c, report_id)
    fields = json.loads(row["fields_json"])
    return {
        "report_id": row["id"],
        "status": row["status"],
        "unresolved_flags": unresolved_count(fields),
        "source_file": row["source_file"],
        "raw_text": row["raw_text"],
        "fields": fields,
    }


def approve(report_id, approved_by, edits):
    """edits: list of {name, value (None = unchanged, "" = clear), confirmed}."""
    approved_by = (approved_by or "").strip()
    if not approved_by:
        raise BadRequest("approved_by is required")

    unresolved = []
    with db.conn() as c:
        row = _load(c, report_id)
        status = row["status"]
        if status not in (states.EXTRACTED, states.NEEDS_REVIEW):
            raise Conflict(f"report is already {status}")

        fields = json.loads(row["fields_json"])
        names = {f["name"] for f in fields}
        edit_map = {}
        for e in edits:
            if e["name"] not in names:
                raise BadRequest(f"unknown field: {e['name']}")
            edit_map[e["name"]] = e

        for f in fields:
            e = edit_map.get(f["name"])
            if e is None:
                continue
            if e.get("value") is not None:
                new = e["value"].strip() or None
                if new != f["value"]:
                    flag, reason = revalidate_field(f["name"], new, row["raw_text"])
                    _audit(c, report_id, "edit", approved_by,
                           {"field": f["name"], "before": f["value"], "after": new})
                    f["value"], f["flag"], f["reason"] = new, flag, reason
                    f["edited"] = True
                    f["confirmed"] = False
            if e.get("confirmed"):
                if f["flag"]:
                    _audit(c, report_id, "confirm", approved_by,
                           {"field": f["name"], "reason": f["reason"]})
                f["confirmed"] = True

        unresolved = [f["name"] for f in fields if f["flag"] and not f.get("confirmed")]
        c.execute("UPDATE reports SET fields_json=?, updated_at=? WHERE id=?",
                  (json.dumps(fields), _now(), report_id))

        if unresolved:
            if status != states.NEEDS_REVIEW:
                _set_status(c, status, states.NEEDS_REVIEW, report_id)
                _audit(c, report_id, "needs_review", approved_by)
            _audit(c, report_id, "approve_blocked", approved_by, {"unresolved": unresolved})
        else:
            _set_status(c, status, states.APPROVED, report_id)
            c.execute("UPDATE reports SET approved_by=?, approved_at=? WHERE id=?",
                      (approved_by, _now(), report_id))
            _audit(c, report_id, "approve", approved_by)

    if unresolved:
        raise Conflict({"message": "unresolved flags", "unresolved": unresolved})
    return {"report_id": report_id, "status": states.APPROVED}


def patient_view(report_id, lang="en"):
    lang = (lang or "en").lower()
    if lang not in LANGS:
        raise BadRequest(f"unsupported language: {lang}. Use one of {sorted(LANGS)}")
    with db.conn() as c:
        row = _load(c, report_id)
    if row["status"] not in (states.APPROVED, states.RELEASED):
        raise Forbidden("report has not been approved by a doctor yet")

    # PHASE 1 STUB: static text. Phase 5 generates this from the approved fields only.
    view = json.loads((DATA_DIR / "mock_patient.json").read_text(encoding="utf-8"))
    view.update({
        "report_id": report_id,
        "status": "approved",
        "language": "en",
        "requested_language": lang,
        "translation_available": lang == "en",
    })
    return view


def get_audit(report_id):
    with db.conn() as c:
        _load(c, report_id)
        rows = c.execute(
            "SELECT action, actor, detail_json, ts FROM audit_log WHERE report_id=? ORDER BY id", (report_id,)
        ).fetchall()
    return [
        {"action": r["action"], "actor": r["actor"],
         "detail": json.loads(r["detail_json"]) if r["detail_json"] else None, "ts": r["ts"]}
        for r in rows
    ]
