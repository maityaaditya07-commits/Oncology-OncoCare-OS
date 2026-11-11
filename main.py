from typing import List, Optional

from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import config, service
from .errors import DomainError

app = FastAPI(title="Oncology Care Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
def domain_error_handler(request, exc: DomainError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


def require_doctor(x_role: Optional[str] = Header(default=None)):
    """Mock auth for the prototype: doctor routes need the header X-Role: doctor."""
    if config.enforce_role() and (x_role or "").lower() != "doctor":
        raise HTTPException(status_code=403, detail="doctor role required (send header X-Role: doctor)")


class FieldEdit(BaseModel):
    name: str
    value: Optional[str] = None  # None = unchanged, "" = clear the value
    confirmed: bool = False


class ApproveRequest(BaseModel):
    approved_by: str = Field(min_length=1)
    fields: List[FieldEdit] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/upload", dependencies=[Depends(require_doctor)])
def upload(file: UploadFile = File(...)):
    data = file.file.read(config.MAX_UPLOAD_BYTES + 1)
    return service.create_report(file.filename, data)


@app.get("/reports", dependencies=[Depends(require_doctor)])
def reports():
    return service.list_reports()


@app.get("/summary/{report_id}", dependencies=[Depends(require_doctor)])
def summary(report_id: str):
    return service.get_summary(report_id)


@app.post("/approve/{report_id}", dependencies=[Depends(require_doctor)])
def approve(report_id: str, body: ApproveRequest):
    edits = [e.model_dump() for e in body.fields]
    return service.approve(report_id, body.approved_by, edits)


@app.get("/audit/{report_id}", dependencies=[Depends(require_doctor)])
def audit(report_id: str):
    return service.get_audit(report_id)


@app.get("/patient/{report_id}")
def patient(report_id: str, lang: str = Query(default="en")):
    return service.patient_view(report_id, lang)
