# Oncology Care Platform: backend (Person A)

Phase 1: API skeleton + approval state machine. Extraction is a **stub** that returns `mock_report.json`.

## Run
```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # then: export the vars, or set them in your shell
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
```

## Test
```bash
python -m unittest discover -s tests -p "test_service.py" -v   # logic, no web deps
pytest                                                         # HTTP tests (needs requirements installed)
```

## Endpoints (contract with B: see schema.json)
| Method + path | Who | Notes |
|---|---|---|
| `GET /health` | anyone | used by the keep-alive ping |
| `POST /upload` | doctor | multipart `file` (PDF, max 10 MB) -> `{report_id, status}` |
| `GET /reports` | doctor | list for the report list screen |
| `GET /summary/{id}` | doctor | fields, flags, raw_text, status |
| `POST /approve/{id}` | doctor | body below; **409** if any flag is unresolved |
| `GET /audit/{id}` | doctor | upload, extract, edit, confirm, approve log |
| `GET /patient/{id}?lang=hi` | patient | **403** unless approved |

Doctor routes need the header `X-Role: doctor` (mock auth). Set `ENFORCE_ROLE=false` to switch it off.

`POST /approve/{id}` body:
```json
{"approved_by": "Dr A", "fields": [
  {"name": "Ki-67", "value": "25", "confirmed": false},
  {"name": "ER", "confirmed": true}
]}
```
- `value` omitted/null = unchanged; `""` = clear it; a new value is re-validated.
- A flagged field is resolved only if the doctor edits it to a passing value or sets `confirmed: true`.
- On 409 the response lists `detail.unresolved`; edits are kept and status becomes `needs_review`.

## Quick demo
```bash
curl -F "file=@sample.pdf" -H "X-Role: doctor" localhost:8000/upload
curl -H "X-Role: doctor" localhost:8000/summary/r_XXXX
curl -X POST -H "X-Role: doctor" -H "Content-Type: application/json" \
  -d '{"approved_by":"Dr A","fields":[{"name":"Ki-67","confirmed":true}]}' localhost:8000/approve/r_XXXX
curl "localhost:8000/patient/r_XXXX?lang=en"
```

## Env vars
`ALLOWED_ORIGINS` (add B's Vercel URL), `STUB_FLAGS` (true keeps the Ki-67 flag), `ENFORCE_ROLE`, `DB_PATH`, `UPLOAD_DIR`, `GEMINI_API_KEY` (Phase 2).

## Where later phases plug in
- Phase 2: replace `run_extraction()` in `app/extraction.py` (same return shape).
- Phase 3: replace `revalidate_field()` in `app/extraction.py` with the evidence check and rules.
- Phase 5: replace the static text in `patient_view()` in `app/service.py`.

## Stubbed in Phase 1
Extraction, flags (from the mock), patient text (static), translation (English only), real auth.
