import asyncio
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from backend import coach, engine
from backend.app import create_app


@pytest.fixture
def lab(tmp_path, monkeypatch):
    monkeypatch.setenv("FAULTLAB_OLLAMA_ENABLED", "0")
    path = str(tmp_path / "sessions.sqlite3")
    app = create_app(path)
    with TestClient(app) as client:
        yield client, app, path


def start(client, mode="practice"):
    response = client.post("/api/sessions", json={"mode": mode})
    assert response.status_code == 201
    data = response.json()
    return f"/api/sessions/{data['session']['id']}", {"X-Session-Key": data["key"]}


def test_capability_key_is_required_and_export_cannot_leak_answer(lab):
    c, app, path = lab
    route, headers = start(c)
    assert c.get(route).status_code == 404
    assert c.get(route, headers={"X-Session-Key": "wrong"}).status_code == 404
    for suffix in ["", "/export"]:
        response = c.get(route + suffix, headers=headers)
        assert response.status_code == 200
        public = response.json()
        assert public["report"] is None
        assert "original_fault" not in response.text and "seed" not in public
        assert headers["X-Session-Key"] not in response.text
        assert response.headers["Cache-Control"] == "no-store"
    assert headers["X-Session-Key"].encode() not in open(path, "rb").read()


def test_api_does_not_allow_choosing_hidden_answer(lab):
    c, *_ = lab
    response = c.post("/api/sessions", json={"mode": "practice", "fault": "sensor_stuck", "seed": 1})
    assert response.status_code == 422


def test_saved_session_survives_app_restart(lab):
    c, _, path = lab
    route, headers = start(c)
    c.post(route + "/stimulus", headers=headers, json={"temperature": 42})
    result = c.post(route + "/probe", headers=headers, json={"tool": "raw_sensor", "prediction": "I expect a warmer reading after the temperature step."})
    assert result.status_code == 200
    with TestClient(create_app(path)) as reopened:
        assert reopened.get(route, headers=headers).json() == result.json()


def test_invalid_mutation_rolls_back_without_losing_session(lab):
    c, *_ = lab
    route, headers = start(c)
    before = c.get(route, headers=headers).json()
    assert c.post(route + "/repair", headers=headers, json={"action": "replace_sensor"}).status_code == 400
    assert c.post(route + "/stimulus", headers=headers, json={"temperature": 100}).status_code == 422
    assert c.post(route + "/probe", headers=headers, json={"tool": "raw_sensor", "prediction": "            "}).status_code == 400
    assert c.get(route, headers=headers).json() == before


def test_assessment_coach_disabled_on_server(lab):
    c, *_ = lab
    route, headers = start(c, "assessment")
    assert c.post(route + "/coach", headers=headers, json={}).status_code == 403
    assert c.get(route, headers=headers).json()["hints_used"] == 0


def test_guided_coach_and_closed_session_rules(lab):
    c, *_ = lab
    route, headers = start(c)
    data = c.post(route + "/coach", headers=headers, json={}).json()
    assert data["hints_used"] == 1 and data["coach"][-1]["provider"] == "guided"
    done = c.post(route + "/finish", headers=headers).json()
    assert done["completed"] and done["report"]["answer"]
    assert c.post(route + "/coach", headers=headers, json={}).status_code == 400
    assert c.post(route + "/probe", headers=headers, json={"tool": "raw_sensor", "prediction": "This should not run after ending."}).status_code == 400


def test_health_and_body_size_limit(lab):
    c, *_ = lab
    assert c.get("/api/health").json()["status"] == "ok"
    assert c.post("/api/sessions", content="x" * 40000).status_code == 413
    assert c.get("/api/no-such-route").status_code == 404


def test_model_receives_observations_but_no_answer_key(monkeypatch):
    monkeypatch.setenv("FAULTLAB_OLLAMA_ENABLED", "1")
    state = engine.new_state("case", "practice", 7, fault="firmware_stale")
    engine.set_stimulus(state, 45)
    engine.probe(state, "raw_sensor", "I expect the sensor to respond to heat.")
    original_client = httpx.AsyncClient
    seen = []
    def respond(request):
        payload = json.loads(request.content)
        seen.append(payload)
        return httpx.Response(200, json={"message": {"content": "Which sample does the controller use?"}})
    monkeypatch.setattr(coach.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    result = asyncio.run(coach.respond(state, "What should I compare?"))
    assert result["provider"] == "ollama"
    context = json.loads(seen[0]["messages"][1]["content"])
    assert context["observations"] == state["observations"]
    assert not {"seed", "active_fault", "original_fault", "report"} & context.keys()
    assert "firmware_stale" not in json.dumps(context)
    assert seen[0]["stream"] is False


@pytest.mark.parametrize("payload", [{"error": "model missing"}, {"message": {"content": []}}, {"message": {"content": ""}}])
def test_malformed_model_response_falls_back(monkeypatch, payload):
    monkeypatch.setenv("FAULTLAB_OLLAMA_ENABLED", "1")
    original_client = httpx.AsyncClient
    monkeypatch.setattr(coach.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload)), **kwargs))
    result = asyncio.run(coach.respond(engine.new_state("case", "practice", 1), "Help"))
    assert result["provider"] == "guided"
    assert "unavailable" in result["notice"]


def test_unreachable_model_falls_back(monkeypatch):
    monkeypatch.setenv("FAULTLAB_OLLAMA_ENABLED", "1")
    original_client = httpx.AsyncClient
    def timeout(request):
        raise httpx.ConnectError("unreachable", request=request)
    monkeypatch.setattr(coach.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(timeout), **kwargs))
    assert asyncio.run(coach.respond(engine.new_state("case", "practice", 1), "Help"))["provider"] == "guided"


@pytest.mark.parametrize("fault", engine.FAULTS)
def test_complete_investigation_through_http(lab, monkeypatch, fault):
    c, *_ = lab
    original = engine.new_state
    monkeypatch.setattr(engine, "new_state", lambda session_id, mode, seed: original(session_id, mode, seed, fault=fault))
    route, headers = start(c)
    assert c.post(route + "/stimulus", headers=headers, json={"temperature": 45}).status_code == 200
    for tool in ["raw_sensor", "controller", "network"]:
        response = c.post(route + "/probe", headers=headers, json={"tool": tool, "prediction": "This stage should pass fresh measurements to the next stage."})
        assert response.status_code == 200
        assert response.json()["report"] is None
    observations = response.json()["observations"]
    raw, controller, network = [o["data"] for o in observations]
    inferred = "sensor_stuck" if raw["value"] == 28 else "firmware_stale" if controller["source_sequence_used"] == 0 else "communication_drop"
    assert inferred == fault
    diagnosis = {"fault": inferred, "explanation": "The measurements identify the first stage that stops passing new values.", "evidence_ids": [o["id"] for o in observations]}
    assert c.post(route + "/diagnose", headers=headers, json=diagnosis).status_code == 200
    assert c.post(route + "/repair", headers=headers, json={"action": engine.MATCH[inferred]}).status_code == 200
    finished = c.post(route + "/verify", headers=headers).json()
    assert finished["completed"] and finished["report"]["score"] == 100
    assert c.get(route + "/export", headers=headers).json() == finished
