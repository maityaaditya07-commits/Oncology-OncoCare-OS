"""Extraction layer. PHASE 1: stub that returns the mock report.

Phase 2 replaces run_extraction() with pypdf + OCR + sectioning + Gemini strict JSON.
Phase 3 replaces revalidate_field() with the evidence check and validation rules.
Keep the return shapes the same so nothing else changes.
"""
import json
from pathlib import Path

from . import config

DATA_DIR = Path(__file__).resolve().parent / "data"


def run_extraction(pdf_path):
    mock = json.loads((DATA_DIR / "mock_report.json").read_text(encoding="utf-8"))
    fields = []
    for f in mock["fields"]:
        flag = bool(f["flag"]) and config.stub_flags()
        fields.append({
            "name": f["name"],
            "value": f["value"],
            "source": f["source"],
            "flag": flag,
            "reason": f["reason"] if flag else None,
        })
    return {"raw_text": mock["raw_text"], "fields": fields}


def revalidate_field(name, value, raw_text):
    """Re-check one field after a doctor edit. Returns (flag, reason). Phase 3 makes this real."""
    return False, None
