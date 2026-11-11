"""Approval state machine. Transitions are enforced on the server."""
from .errors import Conflict

UPLOADED = "uploaded"
EXTRACTED = "extracted"
NEEDS_REVIEW = "needs_review"
APPROVED = "approved"
RELEASED = "released"

ALLOWED = {
    UPLOADED: {EXTRACTED},
    EXTRACTED: {NEEDS_REVIEW, APPROVED},
    NEEDS_REVIEW: {NEEDS_REVIEW, APPROVED},
    APPROVED: {RELEASED},
    RELEASED: set(),
}


def can_move(current, new):
    return new in ALLOWED.get(current, set())


def require_move(current, new):
    if not can_move(current, new):
        raise Conflict(f"invalid transition: {current} -> {new}")
