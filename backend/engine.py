"""Deterministic teaching model. The fault key never enters a learner response.

One simulation second is an explicit logical step, not wall-clock time. This is
a simplified first-order temperature system, not a calibrated hardware twin.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timezone
from typing import Any

FAULTS = {
    "sensor_stuck": "Sensor output stuck",
    "firmware_stale": "Firmware reuses an old sample",
    "communication_drop": "Communication delivers no updates",
}
REPAIRS = {
    "replace_sensor": "Replace the sensor module",
    "refresh_firmware": "Correct the firmware sample refresh",
    "restore_link": "Restore the communication link",
}
MATCH = {"sensor_stuck": "replace_sensor", "firmware_stale": "refresh_firmware", "communication_drop": "restore_link"}
TOOLS = {
    "raw_sensor": "Read raw sensor",
    "controller": "Inspect controller",
    "network": "Check communication",
    "dashboard": "Inspect dashboard",
    "inspection": "Inspect connections",
}


class LabError(ValueError):
    pass


def event(s: dict, kind: str, summary: str, **details: Any) -> None:
    s["events"].append({"id": len(s["events"]) + 1, "time": s["time"], "kind": kind, "summary": summary, **details})


def new_state(session_id: str, mode: str, seed: int, fault: str | None = None) -> dict:
    rng = random.Random(seed)
    selected = fault or rng.choice(list(FAULTS))
    if selected not in FAULTS or mode not in {"practice", "assessment"}:
        raise LabError("Invalid case configuration.")
    initial = 28.0 if mode == "practice" else float(rng.choice([24, 26, 30, 32]))
    s = {
        "id": session_id, "mode": mode, "seed": seed, "original_fault": selected,
        "active_fault": selected, "phase": "investigate", "created_at": datetime.now(timezone.utc).isoformat(),
        "initial": initial, "tau": 8.0 if mode == "practice" else rng.choice([6.0, 10.0, 12.0]),
        "time": 0, "actual": initial, "setpoint": initial, "raw": initial,
        "controller": initial, "controller_source_seq": 0, "sent": 0, "acked": 0,
        "dashboard": initial, "dashboard_time": 0, "max_stimulus_delta": 0,
        "observations": [], "events": [], "coach": [], "hints_used": 0,
        "diagnoses": [], "repairs": [], "verification": None, "completed": False,
    }
    event(s, "start", f"Started an independent {mode} case.")
    return s


def advance(s: dict, seconds: int) -> None:
    for _ in range(seconds):
        s["time"] += 1
        s["actual"] += (s["setpoint"] - s["actual"]) * (1 - math.exp(-1 / s["tau"]))
        noise = 0.04 * math.sin(s["time"] * 0.7 + s["seed"] % 19)
        s["raw"] = s["initial"] if s["active_fault"] == "sensor_stuck" else round(s["actual"] + noise, 2)
        if s["active_fault"] != "firmware_stale":
            s["controller"] = s["raw"]
            s["controller_source_seq"] = s["time"]
        s["sent"] += 1
        if s["active_fault"] != "communication_drop":
            s["acked"] += 1
            s["dashboard"] = s["controller"]
            s["dashboard_time"] = s["time"]


def ensure_open(s: dict) -> None:
    if s["completed"]:
        raise LabError("This case is complete. Start a new case to investigate again.")


def set_stimulus(s: dict, temperature: float) -> None:
    ensure_open(s)
    if not math.isfinite(temperature) or not 18 <= temperature <= 65:
        raise LabError("Choose a temperature between 18°C and 65°C.")
    s["setpoint"] = float(temperature)
    s["max_stimulus_delta"] = max(s["max_stimulus_delta"], abs(temperature - s["initial"]))
    advance(s, 10)
    event(s, "stimulus", f"Set chamber to {temperature:g}°C and advanced 10 seconds.", temperature=temperature)


def observe_values(s: dict, tool: str) -> dict:
    if tool == "raw_sensor":
        return {"value": round(s["raw"], 2), "unit": "°C", "sample_sequence": s["time"], "sample_time": s["time"]}
    if tool == "controller":
        return {"value": round(s["controller"], 2), "unit": "°C", "source_sequence_used": s["controller_source_seq"], "loop_count": s["time"], "processed_time": s["time"]}
    if tool == "network":
        return {"packets_sent": s["sent"], "packets_acknowledged": s["acked"], "last_received_time": s["dashboard_time"], "update_age": s["time"] - s["dashboard_time"]}
    if tool == "dashboard":
        return {"value": round(s["dashboard"], 2), "unit": "°C", "received_time": s["dashboard_time"], "update_age": s["time"] - s["dashboard_time"]}
    if tool == "inspection":
        return {"supply": "3.30 V", "sensor_wiring": "Connected", "controller_power": "On", "antenna_connection": "Seated", "note": "A normal physical connection does not prove that software or data delivery is working."}
    raise LabError("Unknown diagnostic tool.")


def measurement_summary(tool: str, data: dict) -> str:
    if tool == "raw_sensor":
        return f"Raw sensor: {data['value']:.2f}°C, sample #{data['sample_sequence']}."
    if tool == "controller":
        return f"Controller: {data['value']:.2f}°C, using sample #{data['source_sequence_used']}."
    if tool == "network":
        return f"{data['packets_acknowledged']} of {data['packets_sent']} packets acknowledged. Last update {data['update_age']} s ago."
    if tool == "dashboard":
        return f"Display: {data['value']:.2f}°C. Update age: {data['update_age']} s."
    return "Power and physical connections appear normal."


def probe(s: dict, tool: str, prediction: str) -> None:
    ensure_open(s)
    if tool not in TOOLS:
        raise LabError("Choose an available tool.")
    prediction = prediction.strip()
    if not 10 <= len(prediction) <= 500:
        raise LabError("Write a prediction of 10–500 characters before measuring.")
    advance(s, 5)
    data = observe_values(s, tool)
    obs = {"id": f"E{len(s['observations']) + 1:02d}", "time": s["time"], "tool": tool,
           "label": TOOLS[tool], "prediction": prediction, "setpoint": s["setpoint"],
           "data": data, "summary": measurement_summary(tool, data)}
    s["observations"].append(obs)
    event(s, "measurement", obs["summary"], evidence_id=obs["id"], prediction=prediction, tool=tool)


def diagnose(s: dict, fault: str, explanation: str, evidence_ids: list[str]) -> None:
    ensure_open(s)
    if s["mode"] == "assessment" and s["diagnoses"]:
        raise LabError("Assessment allows one diagnosis. Continue to repair and verification.")
    if fault not in FAULTS:
        raise LabError("Choose a diagnosis.")
    if not 20 <= len(explanation.strip()) <= 2000:
        raise LabError("Explain your diagnosis in 20–2,000 characters.")
    known = {e["id"] for e in s["observations"]}
    if len(set(evidence_ids)) < 2 or not set(evidence_ids).issubset(known):
        raise LabError("Select at least two real evidence records from this case.")
    s["diagnoses"].append({"fault": fault, "explanation": explanation.strip(), "evidence_ids": sorted(set(evidence_ids)), "time": s["time"]})
    s["phase"] = "repair"
    event(s, "diagnosis", f"Proposed: {FAULTS[fault]}.", explanation=explanation.strip(), evidence_ids=sorted(set(evidence_ids)))


def repair(s: dict, action: str) -> None:
    ensure_open(s)
    if not s["diagnoses"]:
        raise LabError("Submit a supported diagnosis before applying a repair.")
    if action not in REPAIRS:
        raise LabError("Choose a repair action.")
    if s["mode"] == "assessment" and s["repairs"]:
        raise LabError("Assessment allows one repair. Verify its result.")
    s["repairs"].append({"action": action, "time": s["time"]})
    if action == MATCH[s["original_fault"]]:
        s["active_fault"] = None
    advance(s, 5)
    s["phase"] = "verify"
    event(s, "repair", REPAIRS[action] + ". Recovery still needs verification.", action=action)


def verify(s: dict) -> None:
    ensure_open(s)
    if not s["repairs"]:
        raise LabError("Apply a repair before running recovery verification.")
    first = s["initial"] + 2
    s["setpoint"] = first
    advance(s, 45)
    a = {"setpoint": first, "display": round(s["dashboard"], 2), "time": s["time"], "age": s["time"] - s["dashboard_time"]}
    s["setpoint"] = first + 10
    advance(s, 45)
    b = {"setpoint": first + 10, "display": round(s["dashboard"], 2), "time": s["time"], "age": s["time"] - s["dashboard_time"]}
    passed = abs(a["display"] - a["setpoint"]) <= 1.5 and abs(b["display"] - b["setpoint"]) <= 1.5 and b["display"] - a["display"] >= 8 and b["age"] <= 2
    s["verification"] = {"passed": passed, "points": [a, b], "response_delta": round(b["display"] - a["display"], 2), "criterion": "Both settled readings within 1.5°C of the setpoint, response ≥8°C to a 10°C step, and update age ≤2 s."}
    event(s, "verification", "Recovery verified at two temperatures." if passed else "Recovery check failed. The display did not track the test temperatures.", result=s["verification"])
    if passed or s["mode"] == "assessment":
        s["completed"] = True
        s["phase"] = "complete"
    else:
        s["phase"] = "repair"


def finish(s: dict) -> None:
    ensure_open(s)
    s["completed"] = True
    s["phase"] = "complete"
    event(s, "finish", "Case ended for review. The answer is now available in the report.")


def guided_hint(s: dict) -> str:
    # Deliberately does not read either fault field. The LLM receives the same evidence.
    latest = {e["tool"]: e for e in s["observations"]}
    if s["max_stimulus_delta"] < 5:
        return "A constant input cannot distinguish a frozen reading from a healthy one. Change the chamber by at least 5°C, predict what should change, then measure."
    if "raw_sensor" not in latest:
        return "You changed the input. Measure the raw sensor output next: does the signal itself respond, or is the freeze introduced farther downstream?"
    raw = latest["raw_sensor"]
    if abs(raw["data"]["value"] - s["initial"]) < 0.15:
        return f"{raw['id']} records a raw value close to the starting value after a stimulus change. Check a second stage or repeat the measurement after settling. Which observation would challenge your explanation?"
    if "controller" not in latest:
        return f"{raw['id']} shows the raw reading responding. Compare it with the controller's processed value and the source sample sequence it actually used."
    ctrl = latest["controller"]
    if ctrl["data"]["source_sequence_used"] == 0:
        return f"Compare {raw['id']} and {ctrl['id']}: a new sensor sample exists, but the controller still uses sample #0. Explain where fresh information stops moving."
    if "network" not in latest:
        return "The sensor and controller have both been measured. Check packet acknowledgements and the dashboard update age to test whether processed readings reach the display."
    return "Use two evidence records to explain the first stage where the expected update stops. Choose a repair for that stage, then verify recovery with a new temperature step."


def report(s: dict) -> dict | None:
    if not s["completed"]:
        return None
    d = s["diagnoses"][-1] if s["diagnoses"] else None
    selected = [e for e in s["observations"] if d and e["id"] in d["evidence_ids"]]
    stages = {e["tool"] for e in selected}
    discrimination = {
        "sensor_stuck": "raw_sensor" in stages and bool(stages & {"controller", "network", "dashboard"}),
        "firmware_stale": {"raw_sensor", "controller"}.issubset(stages),
        "communication_drop": "controller" in stages and bool(stages & {"network", "dashboard"}),
    }[s["original_fault"]]
    stimulated = any(abs(e["setpoint"] - s["initial"]) >= 5 for e in selected)
    evidence_score = (10 if len(stages) >= 2 else 0) + (5 if stimulated else 0) + (10 if discrimination and stimulated else 0)
    correct = bool(d and d["fault"] == s["original_fault"])
    good_repair = bool(s["repairs"] and s["repairs"][0]["action"] == MATCH[s["original_fault"]])
    verified = bool(s["verification"] and s["verification"]["passed"])
    rubric = [
        {"name": "Diagnosis", "score": 35 if correct else 0, "max": 35, "detail": "Selected fault matches the injected fault."},
        {"name": "Discriminating evidence", "score": evidence_score, "max": 25, "detail": "Distinct stages, changed stimulus and an informative comparison."},
        {"name": "Predictions recorded", "score": 10 if len(selected) >= 2 else 0, "max": 10, "detail": "Predictions accompany cited tests. Their reasoning quality still needs instructor review."},
        {"name": "Targeted first repair", "score": 15 if good_repair else 0, "max": 15, "detail": "First repair addresses the injected failure."},
        {"name": "Recovery verification", "score": 15 if verified else 0, "max": 15, "detail": "The display tracks two new test temperatures."},
    ]
    explanations = {
        "sensor_stuck": "The sensor kept returning its starting value even when the chamber changed. The controller and link could still forward those unchanged samples. A fresh timestamp alone does not prove a correct measurement.",
        "firmware_stale": "The raw sensor responded, but the controller kept using sample #0. The communication path could deliver packets correctly while carrying old data. Compare values and sample provenance together.",
        "communication_drop": "The sensor and controller could update, but acknowledgements and dashboard timestamps stopped. A frozen display can come from lost delivery even when measurement and processing work.",
    }
    return {"score": sum(r["score"] for r in rubric), "rubric": rubric, "correct_diagnosis": correct,
            "recovery_verified": verified, "answer": {"fault": s["original_fault"], "label": FAULTS[s["original_fault"]], "explanation": explanations[s["original_fault"]]},
            "diagnosis": d, "hints_used": s["hints_used"], "tests_run": len(s["observations"]),
            "repair_attempts": len(s["repairs"]), "diagnosis_attempts": len(s["diagnoses"]),
            "limitations": "Workflow score is a transparent prototype rubric, not a validated certification or automatic judgment of reasoning quality."}


def public_state(s: dict) -> dict:
    # Explicit allowlist: adding an internal field cannot accidentally expose it.
    return {"id": s["id"], "mode": s["mode"], "phase": s["phase"], "created_at": s["created_at"],
            "time": s["time"], "initial": s["initial"], "setpoint": s["setpoint"],
            "dashboard": {"value": round(s["dashboard"], 2), "received_time": s["dashboard_time"], "age": s["time"] - s["dashboard_time"]},
            "observations": s["observations"], "events": s["events"], "coach": s["coach"],
            "hints_used": s["hints_used"], "diagnosis": s["diagnoses"][-1] if s["diagnoses"] else None,
            "repairs": s["repairs"], "verification": s["verification"], "completed": s["completed"], "report": report(s)}
