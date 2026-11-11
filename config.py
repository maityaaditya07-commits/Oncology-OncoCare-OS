import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def db_path():
    return os.getenv("DB_PATH", str(BASE / "oncology.db"))


def upload_dir():
    p = Path(os.getenv("UPLOAD_DIR", str(BASE / "uploads")))
    p.mkdir(parents=True, exist_ok=True)
    return p


def allowed_origins():
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def stub_flags():
    """True keeps the Ki-67 flag from mock_report.json so the approval gate can be tested."""
    return os.getenv("STUB_FLAGS", "true").lower() == "true"


def enforce_role():
    return os.getenv("ENFORCE_ROLE", "true").lower() == "true"
