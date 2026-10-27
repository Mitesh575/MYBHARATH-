from __future__ import annotations
import os
import secrets
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict

from . import engine, coach
from .storage import Store

ROOT = Path(__file__).resolve().parent.parent


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Start(Input):
    mode: Literal["practice", "assessment"] = "practice"


class Stimulus(Input):
    temperature: float = Field(ge=18, le=65)


class Probe(Input):
    tool: Literal["raw_sensor", "controller", "network", "dashboard", "inspection"]
    prediction: str = Field(min_length=10, max_length=500)


class Diagnosis(Input):
    fault: Literal["sensor_stuck", "firmware_stale", "communication_drop"]
    explanation: str = Field(min_length=20, max_length=2000)
    evidence_ids: list[str] = Field(min_length=2, max_length=100)


class Repair(Input):
    action: Literal["replace_sensor", "refresh_firmware", "restore_link"]


class CoachQuestion(Input):
    question: str = Field(default="What should I investigate next?", max_length=1500)


def create_app(db_path: str | None = None) -> FastAPI:
    app = FastAPI(title="FaultLab", version="0.1.0", description="NOVA SPARKZ hackathon prototype. Deterministic diagnosis practice.")
    store = Store(db_path or os.getenv("FAULTLAB_DB", str(ROOT / "data/faultlab.sqlite3")))
    app.state.store = store

    @app.exception_handler(engine.LabError)
    async def invalid_action(request: Request, error: engine.LabError):
        return JSONResponse(status_code=400, content={"detail": str(error)})

    @app.exception_handler(KeyError)
    async def unknown_session(request: Request, error: KeyError):
        return JSONResponse(status_code=404, content={"detail": "Session not found or its access key is missing."})

    @app.middleware("http")
    async def headers(request: Request, call_next):
        if int(request.headers.get("content-length", "0") or 0) > 32768:
            return JSONResponse(status_code=413, content={"detail": "Request body is too large."})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.1.0", "coach": "ollama_optional" if coach.enabled() else "guided", "storage": "sqlite"}

    @app.post("/api/sessions", status_code=201)
    def start(body: Start):
        key = secrets.token_urlsafe(32)
        state = engine.new_state(uuid4().hex, body.mode, secrets.randbelow(2**31))
        store.create(state, key)
        return {"key": key, "session": engine.public_state(state)}

    @app.get("/api/sessions/{session_id}")
    def get(session_id: str, x_session_key: str = Header(default="")):
        return engine.public_state(store.get(session_id, x_session_key))

    @app.post("/api/sessions/{session_id}/stimulus")
    def stimulus(session_id: str, body: Stimulus, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, lambda s: engine.set_stimulus(s, body.temperature)))

    @app.post("/api/sessions/{session_id}/probe")
    def probe(session_id: str, body: Probe, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, lambda s: engine.probe(s, body.tool, body.prediction)))

    @app.post("/api/sessions/{session_id}/diagnose")
    def diagnose(session_id: str, body: Diagnosis, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, lambda s: engine.diagnose(s, body.fault, body.explanation, body.evidence_ids)))

    @app.post("/api/sessions/{session_id}/repair")
    def repair(session_id: str, body: Repair, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, lambda s: engine.repair(s, body.action)))

    @app.post("/api/sessions/{session_id}/verify")
    def verify(session_id: str, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, engine.verify))

    @app.post("/api/sessions/{session_id}/finish")
    def finish(session_id: str, x_session_key: str = Header(default="")):
        return engine.public_state(store.mutate(session_id, x_session_key, engine.finish))

    @app.post("/api/sessions/{session_id}/coach")
    async def ask_coach(session_id: str, body: CoachQuestion, x_session_key: str = Header(default="")):
        state = store.get(session_id, x_session_key)
        engine.ensure_open(state)
        if state["mode"] == "assessment":
            return JSONResponse(status_code=403, content={"detail": "Hints are disabled during independent assessment."})
        response = await coach.respond(state, body.question)

        def append(s):
            engine.ensure_open(s)
            s["hints_used"] += 1
            s["coach"].append({"question": body.question, "time": s["time"], **response})
            engine.event(s, "coach", "Requested coaching.", provider=response["provider"])
        return engine.public_state(store.mutate(session_id, x_session_key, append))

    @app.get("/api/sessions/{session_id}/export")
    def export(session_id: str, x_session_key: str = Header(default="")):
        state = store.get(session_id, x_session_key)
        return JSONResponse(engine.public_state(state), headers={"Content-Disposition": f'attachment; filename="faultlab-{session_id[:8]}.json"'})

    dist = ROOT / "dist"
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(dist / "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Unknown API route."})
        if (dist / "index.html").exists():
            return FileResponse(dist / "index.html")
        return JSONResponse(status_code=503, content={"detail": "Build the frontend with npm run build, then restart the server."})

    return app


app = create_app()
